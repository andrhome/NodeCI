const mongoose = require('mongoose');
const util = require('util');
const redis = require('redis');
const keys = require('../config/keys');
const client = redis.createClient(keys.redisUrl);

client.hget = util.promisify(client.hget);

const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.cache = function (options) {
  this.useCache = true;
  this.hashKey = JSON.stringify(options.key || '');

  return this;
}

mongoose.Query.prototype.exec = async function () {
  if (!this.useCache) {
    return exec.apply(this, arguments);
  }

  const key = JSON.stringify({
    ...this.getQuery(),
    collection: this.mongooseCollection.name,
  });
  const cacheValue = await client.hget(this.hashKey, key);

  if (cacheValue) {
    console.log('RESULT FROM CACHE');
    const data = JSON.parse(cacheValue);

    return Array.isArray(data) ?
      data.map(item => new this.model(item)) :
      new this.model(data);
  }

  const result = await exec.apply(this, arguments);

  client.hset(this.hashKey, key, JSON.stringify(result), 'EX', 10);
  console.log('RESULT FROM MONGODB');

  return result;
}

module.exports = {
  clearHash(hashKey) {
    client.del(JSON.stringify(hashKey));
  }
};
