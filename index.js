const fs = require("fs");
const path = require("path");
const template = path.join(process.cwd(), "template");

module.exports = async function (waw) {
	waw.themes = async (query = {}, limit, count = false) => {
		let exe = count ? waw.Theme.countDocuments(query) : waw.Theme.find(query);

		if (limit) {
			exe = exe.limit(limit);
		}

		return await exe;
	};

	waw.theme = async (query) => {
		return await waw.Theme.findOne(query);
	};

	const reserved = [];
	waw.reserve = (name) => {
		name = name.toLowerCase();
		if (reserved.indexOf(name) === -1) {
			reserved.push(name);
			return true;
		} else {
			return false;
		}
	};
	waw.reserved = (name) => {
		if (!name) return false;
		name = name.toLowerCase();
		return reserved.indexOf(name) !== -1;
	};

	const themes = await waw.themes();

	const directories = waw.getDirectories(
		path.join(process.cwd(), "templates")
	);

	waw.reserve("themes." + waw.config.land);

	const theme = async (_folder, _template) => {
		console.log("theme: " + _folder + "." + waw.config.land);
		waw.reserve(_folder + "." + waw.config.land);
		waw.serve(_template, {
			host: _folder + "." + waw.config.land,
			prefix: "/" + _folder,
		});
		for (const folder of waw.config.theme_pages || ["index"]) {
			if (!fs.existsSync(path.join(_template, "pages", folder))) {
				continue;
			}

			waw.build(_template, folder);

			waw.url(
				path.join(_template, "dist", folder + ".html"),
				"/" + (folder === "index" ? "" : folder),
				{
					...waw.readJson(path.join(_template, "template.json")),
					...waw.readJson(
						path.join(_template, "pages", folder, "page.json")
					),
				},
				_folder + "." + waw.config.land
			);
		}
	};

	for (const template of directories) {
		const folder = path.basename(template);

		if (!themes.find((t) => t.folder === folder)) {
			const theme = await waw.Theme.create({
				name: folder,
				folder,
			});

			themes.push(theme);
		}

		if (waw.config.production) {
			theme(folder, path.join(process.cwd(), "templates", folder));
		}
	}

	for (let i = themes.length - 1; i >= 0; i--) {
		const templateJsonPath = path.join(
			process.cwd(),
			"templates",
			themes[i].folder,
			"template.json"
		)
		if (!fs.existsSync(templateJsonPath)) {
			const folder = path.join(
				process.cwd(),
				"templates",
				themes[i].folder
			)
			if (fs.existsSync(folder)) {
				fs.rmSync(folder)
			}
			await await waw.Theme.deleteOne({
				_id: themes[i]._id
			});
			themes.splice(i, 1);
			continue;
		}
		const templateJson = waw.readJson(templateJsonPath) || {};
		themes[i].variables = templateJson.variables || {};
		themes[i].markModified("variables");
		if (!themes[i].variablesInfo || !themes[i].variablesInfo.length) {
			themes[i].variablesInfo = templateJson.variablesInfo || [];
		}
		const variableExists = [];
		for (const variable in themes[i].variables) {
			variableExists.push(variable);
			if (
				themes[i].variablesInfo.map((v) => v.variable).indexOf(variable) ===
				-1
			) {
				variableInfo = templateJson.variablesInfo
					? templateJson.variablesInfo[
					templateJson.variablesInfo
						.map((v) => v.variable)
						.indexOf(variable)
					] || {}
					: {};
				themes[i].variablesInfo.push({
					variable,
					description: variableInfo.description || "",
					thumb: variableInfo.thumb || ""
				});
			}
		}
		for (let i = templateJson.variablesInfo?.length; i >= 0; i--) {
			if (
				themes[i] &&
				themes[i].variablesInfo &&
				variableExists.indexOf(templateJson.variablesInfo[i]?.variable) === -1
			) {
				themes[i].variablesInfo.splice(i, 1);
			}
		}
		themes[i].markModified("variablesInfo");
		await themes[i].save();
	}
		const templateJson = waw.readJson(templateJsonPath) || {};
		themes[i].variables = templateJson.variables || {};
		themes[i].markModified("variables");
		if (!themes[i].variablesInfo || !themes[i].variablesInfo.length) {
			themes[i].variablesInfo = templateJson.variablesInfo || [];
		}
		const variableExists = [];
		for (const variable in themes[i].variables) {
			variableExists.push(variable);
			if (
				themes[i].variablesInfo.map((v) => v.variable).indexOf(variable) ===
				-1
			) {
				variableInfo = templateJson.variablesInfo
					? templateJson.variablesInfo[
					templateJson.variablesInfo
						.map((v) => v.variable)
						.indexOf(variable)
					] || {}
					: {};
				themes[i].variablesInfo.push({
					variable,
					description: variableInfo.description || "",
					thumb: variableInfo.thumb || ""
				});
			}
		}
		for (let i = templateJson.variablesInfo?.length; i >= 0; i--) {
			if (
				themes[i].variablesInfo &&
				variableExists.indexOf(templateJson.variablesInfo[i]?.variable) === -1
			) {
				themes[i].variablesInfo.splice(i, 1);
			}
		}
		themes[i].markModified("variablesInfo");
		await themes[i].save();
	}

	waw.crud("theme", {
		get: {
			ensure: waw.next,
			query: () => {
				return {};
			},
		},
		update: {
			ensure: waw.role("admin"),
			query: (req) => {
				return {
					_id: req.body._id,
				};
			},
		},
		create: {
			ensure: waw.block
		},
		delete: {
			ensure: waw.block
		},
	});
	waw.build(template, "themes");
	waw.app.get("/themes", async (req, res) => {
		res.send(
			waw.render(
				path.join(template, "dist", "themes.html"),
				{
					...waw.config,
					themes
				},
				waw.translate(req)
			)
		);
	});
};
