# waw module theme
Module which serves other modules like operator, store and app.

## Operator
## Store
## App

## Management of json for stores, operator and app
As developer, you can add manage for json for any of the module. Add new json configuration you can with `waw.addJson` and pass name of the json content, function which will handle json and description for filled content.
```javascript
waw.addJson('allArticles', (storeOperatorOrApp, fillJson, reqOrNull)=>{
	fillJson.articles = await waw.articles({
		domain: operator.domain
	});
}, 'Filling just all article documents');
```
