const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const date = require(__dirname + "/date.js");

const app = express();

app.set("view engine", "ejs");

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));

//Configure session for user login
app.use(session({
	secret: "key",
	resave: false,
	saveUninitialized: false
}));

//Set authentication
app.use(function(req, res, next) {
	res.locals.isAuthenticated = req.session.isAuthenticated || false;
	next();
});

//Configure multer for local storage saving for profile pictures
const storage = multer.diskStorage({
	destination: function(req, file, cb) {
		cb(null, 'public/uploads');
	},
	filename: function(req, file, cb) {
		cb(null, Date.now() + path.extname(file.originalname));
	}
});

const upload = multer({ storage: storage });

//Middleware to check if session is valid
function checkAuthenticated(req, res, next) {
	if (req.session.isAuthenticated) {
		return next();
	} else {
		res.redirect("/login");
	}
}

//Connect to database
mongoose.connect("mongodb://127.0.0.1:27017/SummerProject");

//User schema
const userSchema = new mongoose.Schema({
	username: String,
	password: String,
	bio: String,
	profilePicture: String
});

const User = mongoose.model("User", userSchema);

//Blog post schema
const blogPostSchema = new mongoose.Schema({
	title: String,
	content: String,
	tags: [String],
	image: String,
	author: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User'
	},
	date: String
});

const BlogPost = mongoose.model("BlogPost", blogPostSchema);

//Home page
app.get("/", function(req, res) {
	BlogPost.find({})
		.sort({ date: -1 })
		.limit(3)
		.populate('author', 'username')
		.then(function(latestPosts) {
			res.render("home", { latestPosts: latestPosts });
		});
});


//Blog page
app.get("/blog", function(req, res) {
	BlogPost.find({})
		.sort({ date: -1 })
		.populate('author', 'username')
		.then(function(blogPosts) {
			res.render("blog", { blogPosts: blogPosts });
		});
});

//Profile page
app.get("/profile", checkAuthenticated, function(req, res) {
	User.findById(req.session.userId)
		.then(function(foundUser) {
			if (!foundUser) {
				res.redirect("/login");
			} else {
				//Find blogs posted by user
				BlogPost.find({ author: req.session.userId })
					.then(function(blogPosts) {
						res.render("profile", { user: foundUser, blogPosts: blogPosts });
					});
			}
		});
});

//Function for valid password
function isValidPassword(password) {
	const uppercasePattern = /[A-Z]/;
	const numberPattern = /[0-9]/;
	const specialCharacterPattern = /[!@#$%^&*(),.?":{}|<>]/;
	
	return uppercasePattern.test(password) &&
		numberPattern.test(password) &&
		specialCharacterPattern.test(password);
}

//Signup page
app.get("/signup", function(req, res) {
	res.render("signup", { errorMessage: null });
});

app.post("/signup", upload.single("profilePicture"), function(req, res) {
	
	
	//Check for valid password
	if (!isValidPassword(req.body.password)) {
		return res.render("signup", { errorMessage: "Password must contain at least one uppercase, one number and one special character" });
	}
	
	const newUser = new User({
		username: req.body.username,
		password: req.body.password,
		bio: req.body.bio,
		profilePicture: req.file ? '/uploads/' + req.file.filename : null
	});
	
	//Check for unique username
	User.findOne({ username: newUser.username })
		.then(function(foundUser) {
			if (!foundUser) {
				newUser.save()
					.then(function() {
						req.session.isAuthenticated = true;
						req.session.userId = newUser._id;
						res.redirect("/profile");
					});
			} else {
				res.render("signup", { errorMessage: "Pick a different username" });
			}
		});
});

//Login page
app.get("/login", function(req, res) {
	res.render("login", {errorMessage: null});
});

app.post("/login", function(req, res) {
	const username = req.body.username;
	const password = req.body.password;
	
	User.findOne({ username: username, password: password })
		.then(function (foundUser) {
			if (!foundUser) {
				res.render("login", { errorMessage: "Incorrect username or password" });
			} else {
				req.session.isAuthenticated = true;
				req.session.userId = foundUser._id;
				res.redirect("/profile");
			}
		});
});

//Logout post
app.post("/logout", function(req, res) {
	req.session.destroy(function(err) {
		if (err) {
			return res.redirect("/profile");
		}
		res.redirect("/login");
	});
});

//Create blog
app.get("/newPost", checkAuthenticated, function(req, res) {
	User.findById(req.session.userId)
		.then(function(foundUser) {
			if (!foundUser) {
				res.redirect("/login");
			} else {
				res.render("newPost");
			}
		});
});

app.post("/newPost", upload.single("image"), function(req, res) {
	const newPost = new BlogPost({
		title: req.body.title,
		content: req.body.blog,
		tags: req.body.tag.split(',').map(tag => tag.trim()),
		image: req.file ? '/uploads/' + req.file.filename : null,
		author: req.session.userId,
		date: date.getDate()
	});
	
	newPost.save()
		.then(function() {
			res.redirect("/profile");
		});
});

//Delete Post
app.post("/deletePost", checkAuthenticated, function(req, res) {
	const postId = req.body.postId;
	
	BlogPost.findByIdAndDelete(postId)
		.then(function() {
			res.redirect("/profile");
		});
});

//Edit Post
app.get("/editPost", checkAuthenticated, function(req, res) {
	const postId = req.query.postId;
	
	BlogPost.findById(postId)
		.then(function(post) {
			if (!post) {
				return res.redirect("/profile");
			}
			res.render("editPost", { post: post });
		});
});

app.post("/editPost", checkAuthenticated, upload.single("image"), function(req, res) {
	const postId = req.body.postId;
	
	BlogPost.findById(postId)
		.then(function(post) {
			if (!post) {
				return res.redirect("/profile");
			}
			
			post.title = req.body.title;
			post.content = req.body.content;
			post.tags = req.body.tags.split(',').map(tag => tag.trim());
			post.image = req.file ? '/uploads/' + req.file.filename : post.image;
			post.date = date.getDate();
			
			return post.save();
		})
		.then(function() {
			res.redirect("/profile");
		});
});

//Search Engine Query
app.post("/search", function(req, res) {
	const query = req.body.query;
	const searchResults = [];
	
	//Search Titles
	BlogPost.find({ title: new RegExp(query, "i") })
		.populate('author', 'username')
		.then(function(postsByTitle) {
			searchResults.push(...postsByTitle);
			
			//Search tags
			return BlogPost.find({ tags: new RegExp(query, "i") }).populate('author', 'username');
		})
		.then(function(postsByTags) {
			searchResults.push(...postsByTags);
			
			//Search Users
			return User.find({ username: new RegExp(query, "i") });
		})
		.then(function(users) {
			const userIds = users.map(user => user._id);
			
			//Search blogPosts by users
			return BlogPost.find({ author: {$in: userIds} }).populate('author', 'username');
		})
		.then(function(postsByUsers) {
			searchResults.push(...postsByUsers);
			
			//Search content
			return BlogPost.find({ content: new RegExp(query, "i") }).populate('author', 'username');
		})
		.then(function(postsByContent) {
			searchResults.push(...postsByContent);
			
			//Get rid of duplicates
			const uniqueResults = Array.from(new Set(searchResults.map(post => post._id.toString())))
				.map(id => searchResults.find(post => post._id.toString() === id));
				
			res.render("search", { query: query, searchResults: uniqueResults });
		});
});

app.listen(3000, function() {
	console.log("Server started on port 3000");
});