#!/usr/bin/env node

require("@babel/register")({
    "presets": ["@babel/env"]
});

require('./app.js');
