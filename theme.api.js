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
const ignorePath = path.join(themesPath, ".gitignore");
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

		if (!Array.isArray(jsons)) {
			return;
		}

		jsons = JSON.parse(JSON.stringify(jsons));
		for (let i = 0; i < jsons.length; i++) {
			if (typeof jsons[i] === "string") {
				const path = jsons[i];
				jsons[i] = { path };
			}
		}

		for (const json of jsons) {
			if (typeof _jsons[json.path] === "function") {
				await _jsons[json.path](storeOperatorOrApp, fillJson, req);
			}
		}
	};
	const variablesInfo = (variablesInfo) => {
		variablesInfo = variablesInfo || {};
		for (const variable in variablesInfo) {
			variablesInfo[variable] =
				typeof variablesInfo[variable] === "string"
					? {
							name: variablesInfo[variable],
							fields: {},
					  }
					: variablesInfo[variable];
		}
		return variablesInfo;
	};

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

	const serve = (theme) => {
		if (theme.module === "store" || theme.module === "operator") {
			serveTemplate(theme);
		} else {
			serveApp(theme);
		}
	};

	const serveTemplate = async (theme) => {
		const subdomain = theme.folder || theme.id;
		console.log("serveTemplate: " + subdomain + "." + waw.config.land);
		const _template = path.join(themesPath, theme.id);
		const templateJson = waw.readJson(
			path.join(_template, "template.json")
		);
		const pages = theme.module === 'store' ? waw.config.store.pages.map(p => {
			return {
				url: '/' + (p.page === 'products' ? '' : p.page),
				page: p.page
			}
		}) : waw.getDirectories(path.join(_template, "pages")).map(p => {
			const page = path.basename(p);
			return {
				url: "/" + (page === "index" ? "" : page),
				page
			}
		});
		const page = {};
		for (const p of pages) {
			page[p.url] = async (req, res) => {
				res.send(
					waw.render(
						path.join(_template, "dist", p.page + ".html"),
						{
							...templateJson,
							...waw.readJson(
								path.join(
									_template,
									"pages",
									p.page,
									"page.json"
								)
							),
						},
						waw.translate(req)
					)
				);
			};
		}
		waw.api(
			theme.module === "operator" || !theme.folder
				? {
						template: {
							path: _template,
							prefix: templateJson.prefix,
							pages: pages.map((p) => p.page),
						},
				  }
				: {
						domain: subdomain + "." + waw.config.land,
						template: {
							path: _template,
							prefix: templateJson.prefix,
							pages: pages.map((p) => p.page),
						},
						page,
				  }
		);
	};

	const serveApp = async (theme) => {
		console.log("serveApp: " + _folder + "." + waw.config.land);

		waw.api({
			domain: _folder + "." + waw.config.land,
			app: path.join(themesPath, _folder, "dist", "app"),
		});
	};

	waw.themeSync = (theme, callback = () => {}, errCallback = () => {}) => {
		if (!theme.repo) {
			return errCallback();
		}
		const themePath = path.join(themesPath, theme.id);
		if (fs.existsSync(themePath)) {
			fs.rmSync(themePath, { recursive: true });
		}
		fs.mkdirSync(themePath, { recursive: true });
		waw.fetch(
			themePath,
			theme.repo,
			async () => {
				const templateJsonPath = path.join(
					themesPath,
					theme.id,
					"template.json"
				);
				if (fs.existsSync(templateJsonPath)) {
					const files = waw.getFilesRecursively(themePath);
					theme.repoFiles = files.length;
					theme.repoSize = 0;
					for (const file of files) {
						theme.repoSize += fs.statSync(file).size;
					}
					const templateJson = waw.readJson(templateJsonPath);
					theme.repoPrefix = templateJson.prefix;
					await theme.save();
					serve(theme);
					callback(theme);
				} else {
					const folder = path.join(process.cwd(), "themes", theme.id);
					if (fs.existsSync(folder)) {
						fs.rmSync(folder, { recursive: true });
					}
					theme.repoFiles = null;
					theme.repoSize = null;
					theme.repoPrefix = "";
					await theme.save();
					errCallback();
				}
			},
			theme.branch || "master"
		);
	};

	const themes = await waw.themes();
	const themesFolders = waw.getDirectories(themesPath);
	for (const folder of themesFolders) {
		if (!themes.map((t) => t.id).includes(path.basename(folder))) {
			fs.rmSync(folder, { recursive: true });
		}
	}
	for (const thm of themes) {
		if (thm.repoFiles) {
			if (fs.existsSync(path.join(themesPath, thm.id))) {
				serve(thm);
			} else {
				waw.themeSync(thm);
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
		fetch: {
			ensure: waw.next,
			query: (req) => {
				return {
					_id: req.body._id
				};
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
							recursive: true,
						});
					}
				}
				return {
					_id: req.body._id,
				};
			},
		},
	});

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
				waw.themeSync(
					theme,
					() => {
						res.json(true);
					},
					() => {
						res.json(false);
					}
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
							theme.folder = req.body.folder;
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
					variablesInfo: variablesInfo(json.variablesInfo),
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
					variablesInfo: variablesInfo(json.variablesInfo),
					variables: json.variables || {},
				});
			},
		},
	});
	waw.addJson(
		"storeThemes",
		async (store, fillJson) => {
			fillJson.themes = await waw.themes({
				module: "store",
				enabled: true
			});
			fillJson.footer.themes = fillJson.themes.filter(t => t.top);
		},
		"Filling all store themes documents"
	);
	waw.addJson(
		"topStoreThemes",
		async (store, fillJson) => {
			const themes = await waw.themes({
				module: "store",
				enabled: true,
				top: true
			});
			fillJson.footer.themes = themes;
			fillJson.themes = themes;
		},
		"Filling top store themes"
	);
};
