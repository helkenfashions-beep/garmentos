// Stubbed scene.js — mannequin.js normally creates its own renderer here.
// In GarmentOS we manage our own Three.js scene, so this is intentionally empty.
// Mannequin bodies extend THREE.Group and are added to our scene manually.

var renderer = null;
var scene     = null;
var camera    = null;
var light     = null;
var controls  = null;

function createStage() {}
function getStage()   { return {}; }
function systemAnimate() {}

var clock = { getElapsedTime: () => 0 };
var stage = {};

export { renderer, scene, camera, light, controls, createStage, getStage, systemAnimate, clock, stage };
