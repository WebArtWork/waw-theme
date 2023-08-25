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

	for (const theme of themes) {
		const templateJson =
			waw.readJson(
				path.join(
					process.cwd(),
					"templates",
					theme.folder,
					"template.json"
				)
			) || {};
		theme.variables = templateJson.variables || {};
		theme.markModified("variables");
		if (!theme.variablesInfo || !theme.variablesInfo.length) {
			theme.variablesInfo = templateJson.variablesInfo || [];
		}
		const variableExists = [];
		for (const variable in theme.variables) {
			variableExists.push(variable);
			if (
				theme.variablesInfo.map((v) => v.variable).indexOf(variable) ===
				-1
			) {
				variableInfo = templateJson.variablesInfo
					? templateJson.variablesInfo[
							templateJson.variablesInfo
								.map((v) => v.variable)
								.indexOf(variable)
					  ] || {}
					: {};
				theme.variablesInfo.push({
					variable,
					description: variableInfo.description || "",
					thumb: variableInfo.thumb || ""
				});
			}
		}
		for (let i = templateJson.variablesInfo?.length; i >= 0; i--) {
			if (
				variableExists.indexOf(templateJson.variablesInfo[i]?.variable) === -1
			) {
				theme.variablesInfo.splice(i, 1);
			}
		}
		theme.markModified("variablesInfo");
		await theme.save();
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
