exports.getDate = function() {
	const today = new Date();
	const options = {month: "numeric", day: "numeric", year: "numeric"};
	return today.toLocaleDateString("en-US", options);
};