## Description

Broken Crystals is a benchmark application that uses modern technologies and implements a set of common security vurenabilities. 

The application contains - 
- React based web client
- NodeJS server - the full API documentation is available via swagger 
  - Swagger UI - http://server/swagger
  - Swagger JSON file - http://server/swagger-json
- nginx web server that serves the client and acts as a reverse proxy for server's API request

## Building and running the application

```bash
# build server
$ npm i && npm run build

# build client 
$ cd public
$ npm i && npm run build

#build and start dockers with Postgres DB, nginx and server
$ docker-compose up -d
```
## Vurenabilities Overview 

* **Broken JWT Authentication** - the application includes several endpoints that generate and validate several types of JWT tokens. The main login API (used by UI is using one of the endpoints, while others are available via direct call and described in Swagger).  
  - **No Algorithm bypass** - bypasses the JWT authentication by using the “None” algorithm (implemented in main login and API authorization code)
  - **RSA to HMAC** - changes algorithm to use “HMAC” variation and signs with the public key of the application to bypass the authentication (implemented in main login and API authorization code)
  - **Invalid Signature** - changes the signature of the JWT to something different and bypasses the authentication (implemented in main login and API authorization code)
  - **KID Manipulation** - changes the value of the KID field in the Header of JWT to use either: a static file that the application uses or OS Command that echoes the key that will be signed or SQL code that will return a key that will be used to sign the JWT (implemented in designated endpoint as described in swagger)
  - **Brute Forcing Weak Secret Key** - checks if common secret keys are used (implemented in designated endpoint as described in swagger. The secret token is configurable via .env file is by default is 123)
  - **X5U Rogue Key** - uses the uploaded certificate to sign the JWT and sets the X5U Header in JWT to point to the uploaded certificate (implemented in designated endpoint as described in swagger)
  - **X5C Rogue Key** - the application doesn’t properly check which X5C key is used for signing and when we set X5C headers to our values and sign with our private key, authentication is bypassed (implemented in designated endpoint as described in swagger)
  - **JKU Rogue Key** - uses our publicly available JSON to check if JWT is properly signed after we set the Header in JWT to point to our JSON and sign the JWT with our private key (implemented in designated endpoint as described in swagger
  - **JWK Rogue Key** - we make a new JSON with empty values, hash it, and set it directly in Header and then we use our private key to sign the JWT ((implemented in designated endpoint as described in swagger)

* **Brute Force Login** - Checks if the application user with a weak password. The default setup contains user _admin_ with password _admin_

* **Common Files** - tries to find common files that shouldn’t be publicly exposed (such as “phpinfo”, “.htaccess”, “ssh-key.priv”, etc…). The application contains .htacess and Nginx.conf files under the client's root directory an additional files can be added by placing them under the public/public directory and running a build of the client

* **Cookie Security** - Checks if the cookie has “secure” and HTTP only flag. The application returns two cookies (session and bc-calls-counter cookie), both without secure and HttpOnly flags. 

* **Cross-Site Request Forgery (CSRF)**
  - Checks if a form holds anti-CSRF tokens, misconfigured “CORS” and misconfigured “Origin” header - the application returns "Access-Control-Allow-Origin: *" header for all requests. The behavior can be configured in the /main.ts file
  - The same form with both authenticated and unauthenticated user - the _Email subscription_ UI forms can be used for testing this vulnerability
  - Different form for an authenticated and unauthenticated user - the _Add testimonial_ form can be used for testing. The forms are only available to authenticated users 

* **Cross-Site Scripting (XSS) - 
  - **Reflective XSS** can be demonstrated by using the mailing list subscription form on the landing page
  - **Persistent XSS** can be demonstrated using add testimonial form on the landing page (for authenticated users only)

* **Default Login Location** - the login endpoint is available under /api/auth/login 

* **Directory Listing** - the Nginx config file under the nginx-conf directory is configured to allow directory listing

* **DOM Cross-Site Scripting** - opening the landing page with _dummy_ query param that contains DOM content (including script), add the provided DOM into the page, and execute it

* **File Upload** - the application allows uploading an avatar photo of the authenticated user. The server doesn't perform any sort of validations on the uploaded file

* **Full Path Disclosure** - all errors returned by the server include a full path of the file where the error has occurred. The errors can be triggered by passing wrong values as parameters or by modifying the bc-calls-counter cookie to a none numeric value 

* **Headers Security Check** - the application is configured with misconfigured security headers. The list of headers is available in the headers.configurator.interceptor.ts file. A user can pass the _no-sec-headers_ query param to any API to prevent the server from sending the headers

* **HTML Injection** - both forms testimonial and mailing list subscription forms allow HTML injection

* **HTTP Method fuzzer** - the server supports uploading, deletion, and getting the content of file via /put.raw addition to the URL. The actual implementation using a regular upload endpoint of the server, and the /put.raw endpoint is mapped in Nginx

* **LDAP Injection** - the login request returns an LDAP query for the user's profile, which can be used as a query parameter in /api/users/ldap _query_ query parameter. The returned query can be modified to search for other users. If the structure of the LDAP query is changed, a detailed LDAP error will be returned (with LDAP server information and hierarchy

* **Local File Inclusion (LFI)** - the /api/files endpoint returns any file on the server from the path that is provided in _path_ param. The UI uses this endpoint to load crystal images on the landing page. 

* **Open Database** - the index.html file includes a link to manifest URL, which returns the server's configuration, including a DB connection string

* **Open Database** - the index.html file includes a link to manifest url, which returns server's configuration, including a DB connection string

* **OS Command Injection** - the /api/spawn endpoint spawns a new process using the command in the _command_ query parameter. The endpoint is not referenced from UI 

* **Remote File Inclusion (RFI)** - the /api/files endpoint returns any file on the server from the path that is provided in the _path_ param. The UI uses this endpoint to load crystal images on the landing page 

* **Secret Tokens** - the index.html file includes a link to manifest URL, which returns the server's configuration, including a Mailgun API key

* **Server-Side Template Injection (SSTI)** - the endpoint /api/render receives a plain text body and renders it using doT (http://github.com/olado/dot) templating engine

* **Server-Side Request Forgery (SSRF)** - the endpoint /api/file receives _path_ and _type_ query parameters and returns the content of the file in _path_ with Content-Type value from _type_ parameter. The endpoint supports relative and absolute file names, HTTP/S requests as well as metadata URLs of Azure, Google Cloud, AWS, and DigitalOcean 

* **SQL injection (SQLI)** - the /api/testimonials/count endpoint receives and executes SQL query in _query_ query parameter

* **Unvalidated Redirect** - the endpoint /api/goto redirects the client to the URL provided in the _url_ query parameter. The UI references the endpoint in the header (while clicking on the site's logo) and as an href source for the Terms and Services link in the footer

* **Version Control System** - the client_s build process copies SVN, GIT, and Mercurial source control directories to the client application root and they are accessible under Nginx root. 

* **XML External Entity (XXE)** - the endpoint POST /api/metadata receives an URL encoded XML in _xml_ query parameter, processes it with enabled external entities (using libxmnl library) and returns the serialized DOM. Additionally, for a request that tries to load file:///etc/passwd as an entity, the endpoint returns a mocked up content of the file

* **JavaScript Vulnerabilities Scanning** - index.html includes an older version of the jQuery library with known vulnerabilities 