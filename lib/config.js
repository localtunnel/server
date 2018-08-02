'use strict';

import findup from 'find-up';
import yaml from 'js-yaml';
import deepFreeze from 'deep-freeze';
import fs from 'fs';
import _ from 'lodash';

let config = {};
    
let configFile = findup.sync('localtunnel.yaml') || findup.sync('localtunnel.yml');

if (configFile) {
    
    try {
      config = yaml.safeLoad(fs.readFileSync(configFile, 'utf8'));
    } catch(e) {
        const err = new Error(`Unable to load config file: ${configFile}`);
        err.code = 'CONFIG_LOAD_ERROR';
        throw err;
    }
    
}

_.defaultsDeep(config, {
    'require_token': false,
    'tokens': []
});

config = deepFreeze(config || {});

export default config;