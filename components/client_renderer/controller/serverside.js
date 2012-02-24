/**
 * Resolves the GET HTTP verb.
 *
 * @param {Request} request the request object
 * @param {Response} response the response object
 */
function doGet(request, response) {
    response.writeHead(200, {"Content-Type": "application/jsonp"});

    var dataPlaceholder = {
        css: [ '/component/placeholder/htdocs/css/index.css' ],
        controller: '/components/placeholder/htdocs/controller/index.js',
        domId: 200,
        instanceId : 'joker',
        staticId: 'batman',
        moduleId: 'placeholder-1.0',
        html: '<div class="app_container placeholder_1_0" data-instanceid="joker"\
            data-viewid="VIEW_ID...">\
            <div class="placeholder_loading"></div>',
        wrapperId: request.query.wrapperId
    };

    writeJsonpFunction(dataPlaceholder, response);

    var dataButton = {
        css: [ '/component/textbox/htdocs/css/index.css' ],
        controller: '/components/textbox/htdocs/controller/index.js',
        domId: 500,
        instanceId : 'flash',
        staticId: 'superman',
        moduleId: 'button-1.0',
        html: '<div class="app_container button_1_0" data-instanceid="flash"\
            data-viewid="VIEW_ID...">\
            <div class="placeholder_loading"></div>',
        wrapperId: dataPlaceholder.instanceId
    };

    writeJsonpFunction(dataButton, response);

    response.end();
}

function writeJsonpFunction(data, response){
    response.write('clientRenderer.renderComponent('+JSON.stringify(data)+');');
}

/**
 * Resolves the POST HTTP verb.
 *
 * @param {Request} request the request object
 * @param {Response} response the response object
 */
function doPost(request, response) {}

/**
 * Resolves the DELETE HTTP verb.
 *
 * @param {Request} request the request object
 * @param {Response} response the response object
 */
function doDelete(request, response) {}

/**
 * Resolves the PUT HTTP verb.
 *
 * @param {Request} request the request object
 * @param {Response} response the response object
 */
function doPut(request, response) {}

exports.get = doGet;
exports.post = doPost;
exports.delete = doDelete;
exports.put = doPut;