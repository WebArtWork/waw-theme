const fs = require("fs");
const path = require("path");
const ignore = `# Ignore everything in this directory
*
# Except this file
!.gitignore
`;
const themesPath = path.join(process.cwd(), "themes");
if (!fs.existsSync(themesPath)) {
	fs.mkdirSync(themesPath);
}
const ignorePath = path.join(process.cwd(), "themes", ".gitignore");
if (!fs.existsSync(ignorePath)) {
	fs.writeFileSync(ignorePath, ignore, "utf8");
}
module.exports = async function (waw) {
	const _jsons = {};
	const _jsonsDescription = {};
	waw.addJson = (name, callback, description) => {
		if (name.includes(" ")) {
			console.error("name should be without spaces");
		} else if (_jsons[name]) {
			console.error(
				"You are trying to reconfigure json which already exists"
			);
		} else if (typeof name === "string" && typeof callback === "function") {
			_jsons[name] = callback;
			_jsonsDescription[name] = description;
		}
	};
	waw.processJson = async (jsons, storeOperatorOrApp, fillJson, req) => {
		if (typeof jsons === "string") {
			jsons = jsons.split(" ");
		}

		if (!Array.isArray(jsons) && typeof jsons === "object") {
			jsons = [jsons];
		}

		for (let i = 0; i < jsons.length; i++) {
			if (typeof jsons[i] === "string") {
				jsons[i] = {
					path: jsons[i],
				};
			}
		}
		for (const json of jsons) {
			if (typeof _jsons[json.path] === "function") {
				await _jsons[json.path](storeOperatorOrApp, fillJson, req);
			}
		}
		// remove below after fixes
		for (const json of jsons) {
			if (typeof waw[json.path] === "function") {
				await waw[json.path](storeOperatorOrApp, fillJson, req);
			}
		}
	};

	waw.themes = async (query = {}, limit, count = false) => {
		let exe = count
			? waw.Theme.countDocuments(query)
			: waw.Theme.find(query);

		if (limit) {
			exe = exe.limit(limit);
		}

		return await exe;
	};

	waw.theme = async (query) => {
		return await waw.Theme.findOne(query);
	};

	const template = async (_folder) => {
		console.log("template: " + _folder + "." + waw.config.land);
		const _template = path.join(process.cwd(), "themes", _folder);
		const templateJson = waw.readJson(
			path.join(_template, "template.json")
		);
		const pages = waw.getDirectories(path.join(_template, "pages"));
		const page = {};
		for (const pagePath of pages) {
			const _page = path.basename(pagePath);
			page["/" + _page] = async (req, res) => {
				res.send(
					waw.render(
						path.join(_template, "dist", _page + ".html"),
						{
							...templateJson,
							...waw.readJson(
								path.join(
									_template,
									"pages",
									_page,
									"page.json"
								)
							),
						},
						waw.translate(req)
					)
				);
			};
		}
		waw.api({
			domain: _folder + "." + waw.config.land,
			template: {
				path: _template,
				prefix: templateJson.prefix,
				pages: pages.map((p) => path.basename(p)),
			},
			page,
		});
	};

	const app = async (_folder) => {
		console.log("app: " + _folder + "." + waw.config.land);

		waw.api({
			domain: _folder + "." + waw.config.land,
			app: path.join(process.cwd(), "themes", _folder, "dist", "app"),
		});
	};

	const themes = await waw.themes();
	for (const thm of themes) {
		if (thm.folder && thm.repoFiles) {
			if (thm.module === "store" || thm.module === "operator") {
				template(thm.folder);
			} else {
				app(thm.folder);
			}
		}
	}

	waw.crud("theme", {
		get: {
			ensure: waw.next,
			query: () => {
				return {};
			},
		},
		create: {
			ensure: waw.role("admin"),
		},
		update: {
			ensure: waw.role("admin"),
			query: (req) => {
				return {
					_id: req.body._id,
				};
			},
		},
		delete: {
			ensure: waw.role("admin"),
			query: (req) => {
				if (req.body.folder) {
					const folder = path.join(themesPath, req.body.folder);

					if (folder) {
						fs.rmSync(path.join(themesPath, req.body.folder), {
							recursive: true
						});
					}
				}
				return {
					_id: req.body._id,
				};
			},
		},
	});

	const _uniques = {};
	waw.setUnique = (name, expressFunc) => {
		if (!Array.isArray(_uniques[name])) {
			_uniques[name] = [];
		}
		_uniques[name].push(expressFunc);
	};
	waw.unique = async (name, field, req, res, success, exists) => {
		if (!_uniques[name]) {
			throw "not configured unique";
		}
		let count = _uniques[name].length;
		for (const expressFunc of _uniques[name]) {
			if (!(await expressFunc(field, req, res))) {
				count--;
			}
		}
		if (count) {
			exists();
		} else {
			success();
		}
	};

	waw.setUnique("subdomain", async (folder) => {
		return !!(await waw.Theme.count({ folder }));
	});

	await waw.wait(2000);
	waw.api({
		router: "/api/theme",
		post: {
			"/sync": async (req, res) => {
				const theme = await waw.Theme.findOne(
					req.user.is.admin
						? { _id: req.body._id }
						: { _id: req.body._id, author: req.user._id }
				);
				if (!theme.repo) {
					return res.json(false);
				}
				const themePath = path.join(themesPath, theme.folder);
				if (fs.existsSync(themePath)) {
					fs.rmSync(themePath, { recursive: true });
				}
				fs.mkdirSync(themePath, { recursive: true });
				waw.fetch(
					themePath,
					theme.repo,
					async () => {
						const files = waw.getFilesRecursively(themePath);
						theme.repoFiles = files.length;
						theme.repoSize = 0;
						for (const file of files) {
							theme.repoSize += fs.statSync(file).size;
						}
						const templateJsonPath = path.join(
							process.cwd(),
							"themes",
							theme.folder,
							"template.json"
						);
						if (!fs.existsSync(templateJsonPath)) {
							const folder = path.join(
								process.cwd(),
								"themes",
								theme.folder
							);
							if (fs.existsSync(folder)) {
								fs.rmSync(folder, { recursive: true });
							}
							theme.repoFiles = null;
							theme.repoSize = null;
							await theme.save();
							return res.json(false);
						}
						await theme.save();
						res.json(theme);
					},
					theme.branch || "master"
				);
			},
			"/uniquefolder": async (req, res) => {
				waw.unique(
					"subdomain",
					req.body.folder,
					req,
					res,
					async () => {
						const theme = await waw.Theme.findOne(
							req.user.is.admin
								? { _id: req.body._id }
								: { _id: req.body._id, author: req.user._id }
						);
						if (theme) {
							if (theme.folder) {
								const oldThemePath = path.join(
									themesPath,
									theme.folder
								);
								if (fs.existsSync(oldThemePath)) {
									fs.rmSync(oldThemePath, {
										recursive: true,
									});
								}
							}
							theme.folder = req.body.folder;
							theme.repoFiles = null;
							theme.repoSize = null;
							await theme.save();
							res.json(req.body.folder);
						} else {
							res.json(req.body.folder);
						}
					},
					async () => {
						const theme = await waw.Theme.findOne({
							_id: req.body._id,
						});
						res.json(theme ? theme.folder : "");
					}
				);
			},
		},
		get: {
			"/jsons": (req, res) => {
				const json = [];
				for (const name in _jsonsDescription) {
					json.push({
						_id: name,
						name: name + ": " + _jsonsDescription[name],
					});
				}
				res.json(json);
			},
			"/pages/:folder": (req, res) => {
				const pagesPath = path.join(
					themesPath,
					req.params.folder,
					"pages"
				);
				if (fs.existsSync(pagesPath)) {
					const pages = waw.getDirectories(pagesPath);
					res.json(
						pages.map((p) => {
							return {
								_id: path.basename(p),
								name: path.basename(p),
							};
						})
					);
				} else {
					res.json([]);
				}
			},
			"/template/variables/:folder": (req, res) => {
				const jsonPath = path.join(
					themesPath,
					req.params.folder,
					"template.json"
				);

				const json = fs.existsSync(jsonPath)
					? waw.readJson(jsonPath)
					: {};

				res.json({
					variablesInfo: json.variablesInfo || {},
					variables: json.variables || {},
				});
			},
			"/page/variables/:folder/:page": (req, res) => {
				const jsonPath = path.join(
					themesPath,
					req.params.folder,
					"pages",
					req.params.page,
					"page.json"
				);

				const json = fs.existsSync(jsonPath)
					? waw.readJson(jsonPath)
					: {};

				res.json({
					variablesInfo: json.variablesInfo || {},
					variables: json.variables || {},
				});
			},
		},
	});
};
