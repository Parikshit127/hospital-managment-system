// The app lives inside the hospital-os repo, whose root has its own node_modules (Next.js, a different React).
// Hide that folder from Metro so the bundle can never pick up the web app's copy of React or any other package.
// (mobile/node_modules and its nested folders are untouched.)
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const parentModules = path.resolve(__dirname, '..', 'node_modules').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const existing = config.resolver.blockList;
config.resolver.blockList = [
    ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
    new RegExp(`^${parentModules}[\\\\/].*`),
];

module.exports = config;
