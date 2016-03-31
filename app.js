'use strict';
var co = require("co");
var argv = require('minimist')(process.argv.slice(2));

var psUsername = argv.username || process.env.lorgnette_ps_username;
var psPassword = argv.password || process.env.lorgnette_ps_password;
var lorgnette = require("./lib");

if (!psUsername) {
    console.error("Error: A Pluralsight username must be specified either as a -username argument or via a 'lorgnette_ps_username' environment variable");
    process.exit(1);
}

if (!psPassword) {
    console.error("Error: A Pluralsight password must be specified either as a -password argument or via a 'lorgnette_ps_password' environment variable");
    process.exit(1);
}

var controller = new lorgnette.PluralsightController(psUsername, psPassword, argv);
var run = co.wrap(controller.run.bind(controller));
run().then(function () {
    console.log("done.");
}, function (err) {
    throw err;
});