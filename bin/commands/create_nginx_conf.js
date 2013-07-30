// Copyright © 2012 rainjs
//
// All rights reserved
//
// Redistribution and use in source and binary forms, with or without modification, are permitted
// provided that the following conditions are met:
//
//    1. Redistributions of source code must retain the above copyright notice, this list of
//       conditions and the following disclaimer.
//    2. Redistributions in binary form must reproduce the above copyright notice, this list of
//       conditions and the following disclaimer in the documentation and/or other materials
//       provided with the distribution.
//    3. Neither the name of The author nor the names of its contributors may be used to endorse or
//       promote products derived from this software without specific prior written permission.
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

var path = require('path'),
    fs = require('fs'),
    color = require('colors'),
    util = require('../../lib/util'),
    nginxGenerator = require('../lib/nginx_generate'),
    utils = require('../lib/utils');

/**
 * Register the create component command.
 *
 * @param {Program} program
 */
function register(program) {
    program
        .command('generate-nginx-conf')
        .description('Generate the nginix configuration file')
        .action(generateNginxConfiguration);
}

function generateNginxConfiguration () {

    var projects = [],
        defaultConfiguration = require(path.join(utils.getProjectRoot(), 'build.json'));

    if(defaultConfiguration.additionalProjects) {
        projects.concat(defaultConfiguration.additionalProjects);
    }

    projects.push(utils.getProjectRoot());

    try {
        var nginxConfDefault = fs.readFileSync(path.join(utils.getProjectRoot(),
            '/bin/init/conf/nginx.conf'));

        nginxConfDefault = JSON.parse(defaultConfiguration);
    } catch (e) {
        console.log(e.message.red);
        process.exit(1);
    }

    var generator = new nginxGenerator({
        projects: projects,
        nginxConf: nginxConfDefault
    });

    generator.run();

};


module.exports = register;
