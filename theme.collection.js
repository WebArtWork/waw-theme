
module.exports = async function (waw) {
	const Schema = waw.mongoose.Schema({
		folder: String,
		name: String,
		description: String,
		thumb: String,
		variables: {},
		variablesInfo: [{
			variable: String,
			description: String,
			thumb: String
		}],
		author: { type: waw.mongoose.Schema.Types.ObjectId, ref: 'User' },
		url: { type: String, unique: true, sparse: true, trim: true }
	});

	return waw.Theme = waw.mongoose.model('Theme', Schema);
}
