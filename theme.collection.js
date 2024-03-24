module.exports = async function (waw) {
	const Schema = waw.mongoose.Schema({
		folder: { type: String, unique: true, sparse: true, trim: true },
		top: {
			type: Boolean,
			default: false
		},
		enabled: {
			type: Boolean,
			default: false
		},
		name: String,
		description: String,
		repo: String,
		branch: String,
		repoFiles: Number,
		repoSize: Number,
		repoPrefix: String,
		thumb: String,
		variables: {},
		variablesInfo: [
			{
				variable: String,
				description: String,
				thumb: String,
			},
		],
		module: {
			type: String,
			enum: ["operator", "store", "app"],
		},
		features: [{ type: waw.mongoose.Schema.Types.ObjectId, ref: "Userfeature" }],
		author: { type: waw.mongoose.Schema.Types.ObjectId, ref: "User" },
	});

	Schema.methods.create = function (obj, user) {
		this.author = user._id;
		this.name = obj.name;
		this.thumb = obj.thumb;
		this.description = obj.description;
		this.module = obj.module;
		this.repo = obj.repo;
		this.features = obj.features;
		this.branch = obj.branch;
	};

	return (waw.Theme = waw.mongoose.model("Theme", Schema));
};
