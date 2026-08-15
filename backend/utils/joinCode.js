let crypto = require("crypto");

function generateJoinCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

module.exports = { generateJoinCode };
