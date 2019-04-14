#!/usr/bin/env node

require("@babel/register")({
    "presets": ["@babel/env"]
});

var moment = require('moment');
require('./app.js');
