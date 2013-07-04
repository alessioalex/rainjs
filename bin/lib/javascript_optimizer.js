// Copyright © 2012 rainjs
//
// All rights reserved
//
// Redistribution and use in source and binary forms, with or without modification, are permitted
// provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this list of
// conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice, this list of
// conditions and the following disclaimer in the documentation and/or other materials
// provided with the distribution.
// 3. Neither the name of The author nor the names of its contributors may be used to endorse or
// promote products derived from this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE AUTHOR AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
// IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT
// SHALL THE AUTHOR AND CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
// PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
// OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
// WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING
// IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

"use strict";

var requirejs = require('requirejs'),
    esprima = require('esprima'),
    escodegen = require('escodegen'),
    path = require('path'),
    util = require('../../lib/util'),
    fs = require('fs'),
    extend = require('node.extend');

var excludedModules = ['js/index.min'];
var excludedCoreModules = [
    'raintime/index.min',
    'raintime/lib/es5-shim.min',
    'raintime/lib/jquery_plugins',
    'raintime/lib/require-jquery'
];


function JsOptimizer(options) {
    this._components = options.components;
    this._includedComponents = options.includedComponents;

    this._baseConfig = {
        optimize: "none",
        uglify2: {
            mangle: false
        }
    };
}

JsOptimizer.prototype.run = function () {
    for (var i = 0, len = this._includedComponents.length; i < len; i++) {
        var component = this._components[this._includedComponents[i]],
            output = path.join(component.path, 'client/js/index.min.js');

        var options = component.id === 'core' ?
            this._generateCoreConfiguration(component, component.path, output) :
            this._generateConfiguration(component, component.path, output);

        (function (component) {
            requirejs.optimize(options, function () {
                console.log('js ok', component.id, component.version);
            }, function (err) {
                console.log('error: ', component.id, component.version, err.message);
            });
        })(component);
    }
};

JsOptimizer.prototype._generateConfiguration = function (component, componentPath, outputFile) {
    var self = this;
    var coreLocation = path.join(this._components['core;1.0'].path, 'client', 'js');
    return  extend(true, {}, this._baseConfig, {
        baseUrl: path.join(componentPath, 'client'),
        packages: [{
            name: 'raintime',
            main: 'raintime',
            location: coreLocation
        }, {
            name: component.id + '/' + component.version,
            main: 'js/index',
            location : '.'
        }],

        // t, nt and logger are excluded, but requirejs optimizer still needs to resolve them
        map: {
            '*': {
                't': 'raintime',
                'nt': 'raintime',
                'logger': 'raintime'
            }
        },

        include: this._getModules(componentPath, 'js', excludedModules),
        exclude: ['raintime'],
        excludeShallow: ['t', 'nt', 'logger'],
        out: outputFile,

        wrap: {
            end: util.format("define('%s/%s/js/index.min', [], function () {});",
                component.id, component.version)
        },

        onBuildRead: function (moduleName, path, contents) {
            return self._onBuildRead(this, component, moduleName, path, contents);
        },
        onBuildWrite: function (moduleName, path, contents) {
            return self._onBuildWrite(this, component, moduleName, path, contents);
        }
    });
};

JsOptimizer.prototype._generateCoreConfiguration = function (component, componentPath, outputFile) {
    return {
        baseUrl: path.join(componentPath, 'client', 'js'),

        paths: {
            'text': 'lib/require-text'
        },

        optimize: 'none',
        uglify2: {
            mangle: false
        },

        packages: [{
            name: 'raintime',
            main: 'raintime',
            location: '.'
        }],

        include: this._getModules(componentPath, 'raintime', excludedCoreModules),
        out: outputFile,

        wrap: {
            end: "define('raintime/index.min', [], function () {});"
        }
    };
};

JsOptimizer.prototype._onBuildRead = function (config, component, moduleName, path, contents) {
    var self = this;

    if (moduleName.indexOf(component.id + '/' + component.version) === 0) {
        config.excludeShallow.push(moduleName);
        return contents;
    }

    var ast = esprima.parse(contents),
        defineStatement = this._getDefineStatement(ast);

    if (typeof defineStatement === 'undefined') { // global module
        contents += '\n\n';
        contents += util.format('define("%s", function(){});', moduleName);
        contents += '\n\n';
    } else {
        var deps = this._getDependencies(defineStatement);

        deps.filter(function (dep) {
            return dep.indexOf('js/') !== 0 &&
                dep.indexOf('raintime/') !== 0 &&
                dep.indexOf(component.id + '/' + component.version + '/') !== 0 &&
                ['t', 'nt', 'logger'].indexOf(dep) === -1;
        }).forEach(function (dep) {
            var parts = dep.split('/');
            var externalComponent = self._components[parts[0] + ';' + parts[1]];
            var packageName = parts[0] + '/' + parts[1];

            if (!config.pkgs || config.pkgs[packageName]) {
                return;
            }

            var packageObj = {
                name: packageName,
                main: 'js/index',
                location: '../../' + externalComponent.folder + '/client'
            };

            config.packages.push(packageObj);
            config.pkgs[packageName] = packageObj;
            config.excludeShallow.push(dep);
        });
    }

    return contents;
};

JsOptimizer.prototype._onBuildWrite = function (config, component, moduleName, path, contents) {
    var ast = esprima.parse(contents),
        defineStatement = this._getDefineStatement(ast),
        newName = util.format('%s/%s/%s', component.id, component.version, moduleName);

    defineStatement.expression.arguments[0].value = newName;

    return escodegen.generate(ast);
};

JsOptimizer.prototype._getModules = function (componentPath, modulePrefix, excludedModules) {
    var jsPath = path.join(componentPath, 'client', 'js'),
        modules = [];

    util.walkSync(jsPath, ['.js'], function (filePath) {
        var moduleName = filePath.substring(jsPath.length + 1, filePath.length - 3);


        if (modulePrefix !== 'raintime' || moduleName !== 'raintime') {
            moduleName = modulePrefix + '/' + moduleName.replace('\\', '/');
        }

        if (excludedModules.indexOf(moduleName) === -1) {
            modules.push(moduleName);
        }
    });

    return modules;
};

JsOptimizer.prototype._getDefineStatement = function (ast) {
    // TODO: handle socket.io, promise, step and rain_error

    for (var i = 0, len = ast.body.length; i < len; i++) {
        var statement = ast.body[i];

        if (statement.type === 'ExpressionStatement' &&
            statement.expression.type === 'CallExpression' &&
            statement.expression.callee.name === 'define') {
            return statement;
        }
    }
};

JsOptimizer.prototype._getDependencies = function (defineStatement) {
    var args = defineStatement.expression.arguments,
        depsArg,
        deps = [];

    if (args.length === 3) {
        depsArg = args[1];
    }

    if (args.length === 2) {
        depsArg = args[0];
    }

    if (!depsArg || depsArg.type !== 'ArrayExpression') {
        return [];
    }

    for (var i = 0, len = depsArg.elements.length; i < len; i++) {
        var dep = depsArg.elements[i];
        if (dep.type === 'Literal') {
            deps.push(dep.value);
        }
    }

    return deps;
};

module.exports = JsOptimizer;
