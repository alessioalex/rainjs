"use strict";

var crypto = require('crypto'),
    util = require('util'),
    logger = require('../logging').get(),
    config = require('rain/lib/configuration'),
    adapter = require('./adapter').get(),
    Promise = require('promised-io/promise');

/**
 * Monitoring module.
 *
 * @class
 * @constructor
 * @name Monitoring
 */
function Monitoring () {

    if(!config.monitoring || adapter === null || !config.monitoring.metrics || config.monitoring.disabled) {
        logger.debug('Monitoring module inactive');
        this._disabled = true;
        return this;
    }

    var self = this;

    this._promises = [];

    this._defaultSend = config.monitoring.step || 60;

    this._measurementMap = {};

    for (var i in config.monitoring.metrics) {
        if(!config.monitoring.metrics[i].key) {
            throw new RainError(util.format('Zabbix key is missing in usecase %s', i),
                RainError.ERROR_PRECONDITION_FAILED);
        }
        if(!config.monitoring.metrics[i].operation) {
            throw new RainError(util.format('Operation key is missing in usecase %s', i),
                RainError.ERROR_PRECONDITION_FAILED);
        }
        if (!config.monitoring.metrics[i].disabled) {
            this._measurementMap[i] = config.monitoring.metrics[i];
        }
    }

    //@overwrite the setInterval
    for (var i in this._measurementMap) {
        if(this._measurementMap[i].step) {
            this._overWriteTimeout(i);
        }
    }

    setInterval(function () {
        self._sendData();
    }, this._defaultSend * 1000);

}

Monitoring._instance = null;

/**
 * Singleton getter.
 *
 * @returns {Monitoring} instance of the Monitoring class.
 */
Monitoring.get = function () {
    return Monitoring._instance ||
        (Monitoring._instance = new Monitoring());
}

/**
 * Start of measurement block, computes depending on the operation of the use case.
 *
 * @param {String} configKey, the name of the use case.
 * @param {String} id, the unique measurement id.
 * @returns {String} id, the unique measurement id.
 */
Monitoring.prototype.startMeasurement = function (configKey, id) {
    if(this._disabled) {
        return;
    }

    if (!configKey) {
        logger.error('You must always pass the configuration key of the use case');
        return;
    }

    if (!this._measurementMap[configKey]) {
        logger.error(util.format('There is no measurement configuration available for %s',
            configKey));
        return;
    }

    //register the measurement
    //add the configuration for the measurement
    if (!id || !this._measurementMap[configKey].measurements ||
        !this._measurementMap[configKey].measurements[id]) {
        var id = this._putToMap(configKey, id);
    }

    var typeofMeasurement = this._measurementMap[configKey].operation;
    var measurements = this._measurementMap[configKey].measurements;

    if(typeofMeasurement === 'average') {
        measurements[id].time = Date.now();
    }

    measurements.start = Date.now();

    measurements.activeRequests ++;

    return id;
}

/**
 * End of measurement block, computes depending on the operation of the use case.
 *
 * @param {String} configKey, the name of the use case.
 * @param {String} id, the unique measurement id.
 */
Monitoring.prototype.endMeasurement = function (configKey, id) {
    if(this._disabled) {
        return;
    }

    if (!configKey) {
        logger.error('You must always pass the configuration key of the use case');
        return;
    }

    if (!this._measurementMap[configKey]) {
        logger.error(util.format('There is no measurement configuration available for %s',
            configKey));
        return;
    }

    if (!this._measurementMap[configKey].measurements) {
        logger.error(util.format('No measurement configuration has bee started for the useCase %s',
            configKey));
        return;
    }

    //depending on the type from the config start the time or decrement or stop duration;
    var typeofMeasurement = this._measurementMap[configKey].operation;
    var measurements = this._measurementMap[configKey].measurements;

    if(typeofMeasurement === 'average') {
        var requestTime = Date.now() - measurements[id].time;
        measurements.total += requestTime;
        measurements[id].times.push(requestTime);
        measurements[id].time = 0;
        measurements[id].end = true;
    }

    measurements.end = Date.now();
    measurements.resolvedRequests ++;
    measurements.activeRequests --;
}

/**
 * Special events of collecting monitoring data to the measurementMap
 *
 * @param {String} configKey, useCase for which to gather data.
 */
Monitoring.prototype.registerEvent = function (configKey) {

    if(this._disabled) {
        return;
    }

    if (!configKey) {
        logger.error('You must always pass the configuration key of the use case');
        return;
    }

    if (!config.monitoring.metrics[configKey]) {
        logger.error(util.format('There is no measurement configuration available for %s',
            configKey));
        return;
    }

    if (this._measurementMap[configKey].operation === 'count') {
        if(!this._measurementMap[configKey].measurements) {
            this._measurementMap[configKey].measurements = {
                activeRequests: 0,
                registered: true
            }
        }

        var measurement = this._measurementMap[configKey].measurements;

        measurement.start = Date.now();
        measurement.activeRequests ++;
    }

}

/**
 * Closes Monitoring, writes everything to the Zabbix Server and then finishes.
 *
 * @returns {Promise} when all ongoing writes to zabbix server are finished.
 */
Monitoring.prototype.close = function() {
    if(this._disabled) {
        process.nextTick(function () {
            return Promise.all(this._promises);
        });
    }

    this._sendData('all');
    return Promise.all(this._promises);
}

/**
 * Pushes collected data to the adapter for it to sent it to the monitoring proxy.
 *
 * @param {[JSON]} data, the data to be sent to the adapter
 * @returns status if the data has been successfully sent to the zabbix server.
 * @private
 */
Monitoring.prototype._sendData = function (step) {
    var deferred = Promise.defer(),
        data = this._composeData(step),
        self = this;

    if (data.length === 0) {
        return;
    }

    this._promises.push(deferred.promise);

    var removePromise = function (promise) {
        var index = self._promises.indexOf(promise);
        self._promises.splice(index, 1);
    };

    adapter.sendData(data).then(function () {
        removePromise(deferred.promise);
        self._resetData(step);
        deferred.resolve();
    }, function (err) {
        logger.error('Failed to send data', err);
        removePromise(deferred.promise);
        deferred.reject(new RainError('Failed to send data to zabbix, not reseting values'), true);
    });

}

/**
 * Insert unique id to the useCase key in the measurementMap. If id is not present than it will be generated
 * automatically.
 *
 * @param {String} configKey, the useCase for which the measurement id should be add.
 * @param {String} [id], optional unique measurement id, if none present it will be generated.
 * @returns {String} returns the id added to the measurementMap
 * @private
 */
Monitoring.prototype._putToMap = function (configKey, id) {
    if (!id) {
        var id = this._generateMeasurementId();
        logger.debug(util.format('No id specified for the measurement %s, generating new one', configKey));
    }

    if(!this._measurementMap[configKey].measurements) {
        this._measurementMap[configKey]["measurements"] = {};
        if(this._measurementMap[configKey].operation === 'average') {
            this._measurementMap[configKey].measurements["total"] = 0;
        }
        this._measurementMap[configKey].measurements["resolvedRequests"] = 0;
        this._measurementMap[configKey].measurements["activeRequests"] = 0;
    }

    //I always need a total for easy avg

    var measurements = this._measurementMap[configKey].measurements;

    if (this._measurementMap[configKey].operation === 'average') {
        measurements[id] = {};
        //I would need to store the time maybe but this is not mandatory, to be discussed
        measurements[id]["times"] = [];
        //time is the beginning of Start needed to compute process time;
        measurements[id]["time"] = 0;
    }

    return id;
}

/**
 * Computes the composition map with key and value for Zabbix Sender for each use case.
 *
 * @param {Object} useCase, the useCase for which the calculations are made
 * @param {String/Number} [step], the interval of time
 * @returns {Array} the resulted composition Array for Zabbix Sender
 * @private
 */

Monitoring.prototype._composeDataForUseCase = function (useCase, step) {
    var value,
        composition = [];

    var  timeInterval = (step === 'all' || !step) ? this._defaultSend * 1000 : step * 1000;

    if (useCase.operation === 'average' &&
        useCase.measurements.resolvedRequests !== 0) {
        value = this._average(useCase);
        if(useCase.secondaryKey) {
            composition.push({
                key: useCase.secondaryKey,
                value: useCase.measurements.resolvedRequests
            });
        }
    } else if (useCase.operation === 'count' &&
        (Date.now() - useCase.measurements.start <= timeInterval ||
        Date.now() - useCase.measurements.end <= timeInterval)){
            value = useCase.measurements.activeRequests;
    } else if (useCase.operation === 'resolvedRequests' &&
        useCase.measurements.resolvedRequests !== 0) {
            value = useCase.measurements.resolvedRequests
    }

    useCase.timeOfSend = Date.now();


    if(typeof value !== 'undefined') {
        composition.push({
            key: useCase.key,
            value: value
        });
    }

    return composition;
}
/**
 * Creates a composition Array to be sent to zabbix proxy. If send is successful than metrics of times
 * are reset, otherwise are kept until the next successful send to zabbix.
 *
 * @param {Number/String} [step], optional parameter refering to which interval of time should the
 * composition refer, if absent it's refering to the other measurements that do not over write
 * the timer. If step is ``all`` (only if the close method is called) than all data collected is sent
 * to zabbix.
 *
 * @returns {Array} composed data to send to the zabbix server
 * @private
 */
Monitoring.prototype._composeData = function (step) {
    var composition = [];

    var sendAllData = step === 'all';

    for (var i in this._measurementMap) {
        var isDefault = !this._measurementMap[i].step && !step,
            hasCurrentStep = step && this._measurementMap[i].step === step;

        if(this._measurementMap[i].measurements && (isDefault || hasCurrentStep || sendAllData)) {
            composition = composition.concat(this._composeDataForUseCase(this._measurementMap[i], step));
        }
    }

    return composition;

}

/**
 * Reset values for measurements of times after successful sending.
 *
 * @param {Number} step, the interval of time, useful for reseting only the sent data at that
 * interval.
 * @private
 */
Monitoring.prototype._resetData = function (step) {
    var  timeInterval = (step === 'all' || !step) ? this._defaultSend * 1000 : step * 1000;

    for (var i in this._measurementMap) {
        if(this._measurementMap[i].step === step &&
            Date.now() - this._measurementMap[i].timeOfSend <= timeInterval) {
            for  (var j in this._measurementMap[i].measurements) {
                if (this._measurementMap[i].measurements[j] instanceof Object &&
                    this._measurementMap[i].measurements[j].end){
                    delete this._measurementMap[i].measurements[j];
                    this._measurementMap[i].measurements.resolvedRequests = 0;
                } else {
                    this._measurementMap[i].measurements.resolvedRequests = 0;
                }
            }
        }
        if(this._measurementMap[i].measurements &&
            this._measurementMap[i].measurements.registered) {
            this._measurementMap[i].measurements.activeRequests = 0;
        }
        if(this._measurementMap[i].measurements) {
            this._measurementMap[i].measurements.total = 0;
        }
    }
}

/**
 * Overwrites the timer for use cases that have a different intervals of sending.
 *
 * @param {String} key, the name of the useCase.
 * @private
 */
Monitoring.prototype._overWriteTimeout = function (key) {
    var self = this;
    setInterval(function () {
        self._sendData(self._measurementMap[key].step);
    }, this._measurementMap[key].step * 1000);
}

/**
 * Generates a unique id.
 *
 * @returns {String} the generated unique id.
 * @private
 */
Monitoring.prototype._generateMeasurementId = function () {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Calculates the average for a use case.
 *
 * @param {String} configKey, the name of the use case.
 * @returns {number} the calculated average
 * @private
 */
Monitoring.prototype._average = function (useCase) {
    var measurements = useCase.measurements;
    return measurements.total/measurements.resolvedRequests;
}


module.exports = Monitoring;
