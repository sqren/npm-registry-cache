var path = require('path');
var fs = require('fs');
var request = require('request');
var _ = require('lodash');
var CACHE_FILENAME = path.resolve(__dirname, 'cache.json');

function RegistryCache(options){
    this.options = _.defaults(options || {}, {
        ttl: 1000 * 3600 * 24
    });
    this.cacheFileContent = this._readCacheFile();
    var isStale = this._isStale(this.cacheFileContent.timestamp, this.options.ttl);
    if(isStale) {
        this._update();
    }

    if(this.options.ttl > 0) {
        setInterval(this._update, this.options.ttl);
    }
}

RegistryCache.prototype._update = function () {
    var _this = this;
    var requestOptions = {
        url: 'http://registry.npmjs.org/-/all',
        json: true,
        gzip: true,
        headers: {
            'If-None-Match': this.cacheFileContent.etag
        }
    };

    function requestHandler(err, res, responseBody) {
        var items, etag;
        if (err) {
            console.error('Could not load npm registry', err);
            return;
        }
        switch(res.statusCode) {
            case 200:
                items = _this.getFields(responseBody);
                etag = res.headers.etag;
                _this._writeCacheFile(items, etag);
                break;
            case 304:
                _this._writeCacheFileTimestamp();
                break;
            default:
                console.error('Unexpected status code', res.statusCode);
        }
    }

    request.get(requestOptions, requestHandler);
};

RegistryCache.prototype.getFields = function (items) {
    var fields = this.options.fields;
    if(_.isFunction(fields)){
        return _.values(items).map(fields);
    } else if(_.isArray(fields)){
        return _.values(items).map(function (item) {
            return _.pick(item, fields);
        });
    } else {
        return Object.keys(items);
    }
};

RegistryCache.prototype.get = function() {
    if (!this.cacheFileContent.items) {
        console.warn('The cache is being rebuilt for the very first time. This might take a couple of minutes. Please be patient.');
        return [];
    }
    return this.cacheFileContent.items;
};

RegistryCache.prototype.forceUpdate = function() {
    return this._update();
};

RegistryCache.prototype._isStale = function (cacheTimestamp, validity) {
    var expiryDate = (cacheTimestamp || 0) + validity;
    var isStale = Date.now() > expiryDate;
    return isStale;
};

RegistryCache.prototype._writeCacheFileTimestamp = function() {
    this._writeCacheFile(this.cacheFileContent.items, this.cacheFileContent.etag);
};

RegistryCache.prototype._writeCacheFile = function(items, etag) {
    var filename = CACHE_FILENAME;
    var fileContent = {
        timestamp: Date.now(),
        etag: etag,
        items: items
    };
    fs.writeFile(filename, JSON.stringify(fileContent), function(err) {
        if (err) {
            console.error('Could not save cache', filename, err);
            return;
        }

        this.cacheFileContent = fileContent;
    });
};

RegistryCache.prototype._readCacheFile = function() {
    try {
        return JSON.parse(fs.readFileSync(CACHE_FILENAME, 'utf8'));
    } catch (e) {
        return {};
    }
};

module.exports = RegistryCache;

