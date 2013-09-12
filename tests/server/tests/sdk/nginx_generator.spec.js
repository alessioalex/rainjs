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

describe('Nginx Generator', function () {

    var fs, mocks = {},
        util, utils, nginxGenerator;

    beforeEach(function () {
        fs = jasmine.createSpyObj('fs', ['openSync', 'createWriteStream']);

        mocks['fs'] = fs;

        util = jasmine.createSpyObj('util', ['walkSync', 'inspect']);

        mocks['../../lib/util'] = util;

        utils = jasmine.createSpyObj('utils', ['getProjectRoot']);

        mocks['../lib/utils'] = utils;

        mocks['my_file'] = {
            id: 'fakeId',
            version: 'fakeVersion'
        };

        mocks['my_file_rain'] = {
            id: 'fake_rain_id',
            version: '1.0'
        };
        mocks['my_file_rain2'] = {
            id: 'fake_rain_id',
            version: '2.0'
        };

        nginxGenerator = loadModuleExports('bin/lib/nginx_generator.js', mocks);

    });

    describe('#Constructor', function () {
        it('should construct the module correctly', function () {
            var instance = new nginxGenerator();

            expect(instance).not.toBe('undefined');
        });
    });

    describe('#Run', function () {
        it('should generate the regular expressions for the current project', function () {
            var config = {
                nginxConf: {
                    http: {
                        server: {
                            locations: {}
                        }
                    }
                },
                projects: ['my_proj']
            };

            util.walkSync.andCallFake(function (route, args, cb) {
                cb('my_file', 'my_folder');
            });

            var stream = jasmine.createSpyObj('stream', ['write']);
            fs.createWriteStream.andCallFake(function () {
                return stream;
            });

            var instance = new nginxGenerator(config);

            instance.run();

            //console.log(stream.write.calls[i].args);
            var allArguments = Array.prototype.concat.apply([], stream.write.argsForCall);

            expect(fs.openSync).toHaveBeenCalledWith('nginx.conf', 'w');
            expect(allArguments.indexOf('location ~* fakeId/fakeVersion/.*(resources.*)$')).not.toBe(-1);
            expect(allArguments.indexOf('location ~* fakeId/.*(resources.*)$')).not.toBe(-1);
            expect(allArguments.indexOf('location ~* fakeId/fakeVersion/.*(js.*\\.js)$')).not.toBe(-1);
            expect(allArguments.indexOf('location ~* fakeId/.*(js.*\\.js)$')).not.toBe(-1);
        });

        it('should generate the regular expressions for rainjs', function () {
            var config = {
                nginxConf: {
                    http: {
                        server: {
                            locations: {}
                        }
                    }
                },
                projects: ['my_proj', 'rainjs']
            };

            var times = 1;

            util.walkSync.andCallFake(function (route, args, cb) {
                if(times === 1) {
                    times++;
                    cb('my_file', 'my_folder');
                } else {
                    cb('my_file_rain', 'my_folder_rain');
                }
            });

            var stream = jasmine.createSpyObj('stream', ['write']);
            fs.createWriteStream.andCallFake(function () {
                return stream;
            });

            var instance = new nginxGenerator(config);

            instance.run();

            //console.log(stream.write.calls[i].args);
            var allArguments = Array.prototype.concat.apply([], stream.write.argsForCall);

            expect(fs.openSync).toHaveBeenCalledWith('nginx.conf', 'w');
            expect(allArguments.indexOf('location ~* fakeId/fakeVersion/.*(resources.*)$')).not.toBe(-1);
            expect(allArguments.indexOf('location ~* fakeId/.*(resources.*)$')).not.toBe(-1);
            expect(allArguments.indexOf('location ~* fakeId/fakeVersion/.*(js.*\\.js)$')).not.toBe(-1);
            expect(allArguments.indexOf('location ~* fakeId/.*(js.*\\.js)$')).not.toBe(-1);
            expect(allArguments.indexOf('location ~* fake_rain_id/1.0/.*(resources.*)$')).not.toBe(-1);
            expect(allArguments.indexOf('location ~* fake_rain_id/1.0/.*(js.*\\.js)$')).not.toBe(-1);
            expect(allArguments.indexOf('location ~* fake_rain_id/.*(resources.*)$')).not.toBe(-1);
            expect(allArguments.indexOf('location ~* fake_rain_id/.*(js.*\\.js)$')).not.toBe(-1);
        });
    });

});