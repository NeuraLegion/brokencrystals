require('dotenv').config();
var path = require('path');

const Email= require('email-templates');

const nodemailer = require("nodemailer");
let transporter = nodemailer.createTransport({
	host: process.env.MAIL_HOST,
	port: process.env.MAIL_PORT,
	secure: process.env.MAIL_SECURE, // true for 465, false for other ports
	auth: {
		user: process.env.MAIL_USERNAME,
		pass: process.env.MAIL_PASSWORD
	}
});

module.exports = {
  development: {
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    dialect:process.env.DB_CONNECTION,
    port: process.env.DB_PORT
  },
  test: {
    username: 'bcuname',
    password: password,
    database: 'nameofdb',
    host: '127.0.0.1',
    dialect: 'mysql'
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    dialect: 'mysql',
    // dialectOptions: {
    //   ssl: {
    //     ca: fs.readFileSync(__dirname + '/mysql-ca-master.crt')
    //   }
    // }
  },

  email : new Email({
    message: {
      from: 'something@brokencrystals.com'
    },
    views: { root: __dirname },
    // uncomment below to send emails in development/test env:
    send: true,
    transport: transporter,
    views: {
      options: {
        extension: 'ejs' // <---- HERE
      }
    },
    juice: true,
    juiceResources: {
      preserveImportant: true,
      webResources: {
        //
        // this is the relative directory to your CSS/image assets
        // and its default path is `build/`:
        //
        // e.g. if you have the following in the `<head`> of your template:
        // `<link rel="stylesheet" href="style.css" data-inline="data-inline">`
        // then this assumes that the file `build/style.css` exists
        //
        relativeTo: path.resolve(path.join(__dirname, '..', 'public'))
      }
    }
  })

};
