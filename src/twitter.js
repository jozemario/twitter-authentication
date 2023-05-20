const express = require('express');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const dotenv = require('dotenv');
const OAuth = require('oauth');
const seriate = require('seriate');

dotenv.config();
console.log(dotenv.config())

const app = express();
const port = process.env.PORT || 3000;

var config = {
    "server": process.env.DB_HOST,
    "user": process.env.DB_USER,
    "password": process.env.DB_PASS,
    "database": process.env.DB_DATABASE,
    "port": process.env.DB_PORT,
    "connectionTimeout": 2000000,
    "requestTimeout": 2000000,
    "pool": {
        "max": 100,
        "min": 1,
        "idleTimeoutMillis": 30000
    }
};

/* sql.setDefaultConfig( configdb );
const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true, // If using Azure SQL Database
    },
}; */

const oauthObj = {}

seriate.setDefaultConfig(config);

const consumer = new OAuth.OAuth(
    'https://api.twitter.com/oauth/request_token',
    'https://api.twitter.com/oauth/access_token',
    process.env.API_KEY,
    process.env.API_SECRET,
    '1.0A',
    process.env.CALLBACK_URL,
    'HMAC-SHA1'
);

app.get('/', (req, res) => {
    res.send('Hello, Twitter OAuth 2.0!');
});

app.get('/auth/twitter', (req, res) => {
    consumer.getOAuthRequestToken((error, oauthToken, oauthTokenSecret) => {
        if (error) {
            console.error('Error getting OAuth request token:', error);
            res.status(500).send('Error getting OAuth request token');
        } else {
            seriate.execute({
                query: seriate.fromFile('./queries/insertSession.sql'),
                params: {
                    oauthToken,
                    oauthTokenSecret,
                },
            })
                .then(() => {
                    req.session = {
                        oauth: {
                            token: oauthToken,
                            token_secret: oauthTokenSecret,
                        },
                    };
                    res.redirect(`https://twitter.com/oauth/authorize?oauth_token=${oauthToken}`);
                })
                .catch((err) => {
                    console.error('Error inserting session:', err);
                    res.status(500).send('Error inserting session');
                });
        }
    });
});

app.get('/auth/twitter/callback', (req, res) => {
    const oauthToken = req.query.oauth_token;
    const oauthVerifier = req.query.oauth_verifier;

    seriate.execute({
        query: seriate.fromFile('./queries/getSession.sql'),
        params: {
            oauthToken,
        },
    })
        .then((result) => {
            if (result && result.length > 0) {
                const session = result[0];

                consumer.getOAuthAccessToken(
                    oauthToken,
                    session.token_secret,
                    oauthVerifier,
                    (error, oauthAccessToken, oauthAccessTokenSecret) => {
                        if (error) {
                            console.error('Error getting OAuth access token:', error);
                            res.status(500).send('Error getting OAuth access token');
                        } else {
                            // Update the session with the access token and secret
                            session.token = oauthAccessToken;
                            session.token_secret = oauthAccessTokenSecret;
                            session.oauthToken = oauthToken

                            seriate.execute({
                                query: seriate.fromFile('./queries/updateSession.sql'),
                                params: session,
                            })
                                .then(() => {
                                    // You can now use the OAuth access token and secret
                                    // to make authenticated requests to the Twitter API

                                    // Example: Print the access token and secret
                                    console.log('Access Token:', oauthAccessToken);
                                    console.log('Access Token Secret:', oauthAccessTokenSecret);
                                    oauthObj.token = oauthAccessToken
                                    oauthObj.token_secret = oauthAccessTokenSecret

                                    res.send({ result: 'Authenticated with Twitter!', oauth: { token: oauthAccessToken, token_secret: oauthAccessTokenSecret } });
                                })
                                .catch((err) => {
                                    console.error('Error updating session:', err);
                                    res.status(500).send('Error updating session');
                                });
                        }
                    }
                );
            } else {
                res.status(404).send('Session not found');
            }
        })
        .catch((err) => {
            console.error('Error retrieving session:', err);
            res.status(500).send('Error retrieving session');
        });
});

// Example endpoint handler
app.get('/profile', (req, res) => {
    console.log('profile:', oauthObj)
    const oauthToken = oauthObj.token;
    const oauthTokenSecret = oauthObj.token_secret;

    const url = new URL('https://api.twitter.com/1.1/account/verify_credentials.json');
    url.searchParams.append('include_email', 'true');

    const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
            Authorization: consumer.authHeader(
                url.toString(),
                oauthToken,
                oauthTokenSecret,
                'GET'
            )
        }
    };

    const client = url.protocol === 'https:' ? https : http;

    const request = client.request(options, (response) => {
        let data = '';

        response.on('data', (chunk) => {
            data += chunk;
        });

        response.on('end', () => {
            if (response.statusCode !== 200) {
                console.error('Error accessing Twitter API:', response.statusMessage);
                res.status(500).send('Error accessing Twitter API');
            } else {
                const parsedData = JSON.parse(data);

                // Use the returned data as needed
                const profile = {
                    name: parsedData.name,
                    screen_name: parsedData.screen_name,
                    email: parsedData.email
                };

                res.json(profile);
            }
        });
    });

    request.on('error', (error) => {
        console.error('Error accessing Twitter API:', error);
        res.status(500).send('Error accessing Twitter API');
    });

    request.end();
});

app.get('/apitwitter', (req, res) => {
    console.log('apitwitter:', oauthObj)
    const oauthToken = oauthObj.token;
    const oauthTokenSecret = oauthObj.token_secret;
    //const usernames = 'elifeinzaig,Rodrigo_Arias,KevinCasasZ,JDiegoCastroCR,jchidalgo,phabarca,OttoGuevaraG' // Edit  usernames to look up
    const usernames = 'OttoGuevaraG' // Edit  usernames to look up
    const params = '=created_at,description&expansions=pinned_tweet_id' // Edit optional query parameters here
    const endpointV2 = `https://api.twitter.com/2/users/by?usernames=${usernames}&${params}`;

    const url = new URL(endpointV2);
    //url.searchParams.append('user.fields', 'true');

    const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
            Authorization: consumer.authHeader(
                url.toString(),
                oauthToken,
                oauthTokenSecret,
                'GET'
            )
        }
    };

    const client = url.protocol === 'https:' ? https : http;

    const request = client.request(options, (response) => {
        let data = '';

        response.on('data', (chunk) => {
            data += chunk;
        });

        response.on('end', () => {
            if (response.statusCode !== 200) {
                console.error('Error accessing Twitter API:', response.statusMessage);
                res.status(500).send('Error accessing Twitter API');
            } else {
                const parsedData = JSON.parse(data);

                // Use the returned data as needed
                /* const profile = {
                    name: parsedData.name,
                    screen_name: parsedData.screen_name,
                    email: parsedData.email
                }; */

                res.json(parsedData);
            }
        });
    });

    request.on('error', (error) => {
        console.error('Error accessing Twitter API:', error);
        res.status(500).send('Error accessing Twitter API');
    });

    request.end();
});


app.post('/twitterApi', (req, res) => {
    console.log('twitterApi:', oauthObj);
    const oauthAccessToken = oauthObj.token;
    const oauthAccessTokenSecret = oauthObj.token_secret;
    const payload = {
        action: "updateSuplementos",
        screen_names: "elifeinzaig,Rodrigo_Arias,KevinCasasZ,JDiegoCastroCR,jchidalgo,phabarca,OttoGuevaraG",
        suplemento: "opinion"
    }


    console.log('Body:', payload);

    switch (payload.action) {

        case 'updateSuplementos':
            {
                let screen_names = payload.screen_names;
                let suplemento = payload.suplemento;
                const usernames = 'elifeinzaig,Rodrigo_Arias,KevinCasasZ,JDiegoCastroCR,jchidalgo,phabarca,OttoGuevaraG' // Edit  usernames to look up
                const params = 'user.fields=created_at,description&expansions=pinned_tweet_id' // Edit optional query parameters here
                const endpointV2 = `https://api.twitter.com/2/users/by?usernames=${usernames}&${params}`;
                const endpointV1 = `https://api.twitter.com/1.1/users/lookup.json?screen_name=${screen_names}`

                /*  getRequest(
                     {
                         oauth_token: process.env.ACCESS_TOKEN,//oauthAccessToken,
                         oauth_token_secret: process.env.ACCESS_TOKEN_SECRET,//oauthAccessTokenSecret,
                         endpointURL: endpointV2
                     }
                 )
                     .then((result) => {
                         console.log(result)
                         res.send({
                             suplemento: suplemento,
                             screen_names: screen_names,
                             twitterBios: result,
 
                         });
                     }
                     ) */
                consumer.get(
                    endpointV2,
                    //process.env.ACCESS_TOKEN,
                    oauthAccessToken,
                    //process.env.ACCESS_TOKEN_SECRET,
                    oauthAccessTokenSecret,
                    function (error, data, response) {
                        if (error) {
                            console.log(error);
                        }
                        console.log('updateBios: ', data);
                        let twitterBios = JSON.parse(data);
                        console.log('twitterBios: ', twitterBios)

                        res.send({
                            suplemento: suplemento,
                            screen_names: screen_names,
                            twitterBios: twitterBios,

                        });

                    })
            }
            break;
    }
})


async function getRequest({ oauth_token, oauth_token_secret, endpointURL }) {
    const authHeader = consumer.authHeader(
        endpointURL,
        oauth_token,
        oauth_token_secret,
        'GET'
    );
    console.log('authHeader:', authHeader)

    const options = {
        hostname: new URL(endpointURL).hostname,
        port: 443,
        path: new URL(endpointURL).pathname + new URL(endpointURL).search,
        method: 'GET',
        headers: {
            Authorization: authHeader['Authorization'],
            'user-agent': 'v2UserLookupJS'
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error('Unsuccessful request'));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.end();
    });
}

/* (async () => {
    try {

        // Get request token

        // Get authorization


        // Get the access token
        // const oAuthAccessToken = await accessToken(oAuthRequestToken, pin.trim());

        // Make the request
        const response = await getRequest(oAuthAccessToken);
        return response
     

    } catch (e) {
        console.log(e);
        //process.exit(-1);
    }
    //process.exit();
})(); */

app.get('/user/:username', async (req, res) => {
    // Retrieve the access tokens from sessionStorage


    console.log('twitterApi:', oauthObj);

    const oauthAccessToken = oauthObj.token;
    //const oauthAccessToken = process.env.ACCESS_TOKEN;

    const oauthAccessTokenSecret = oauthObj.token_secret;
    //const oauthAccessTokenSecret = process.env.ACCESS_TOKEN_SECRET;

    console.log('oauthAccessToken:', oauthAccessToken);
    console.log('oauthAccessTokenSecret:', oauthAccessTokenSecret);

    const username = req.params.username;
    const endpointURL = `https://api.twitter.com/1.1/users/lookup.json`;

    const url = new URL(endpointURL);
    url.searchParams.append('screen_name', `${username}`);
    console.log(url.toString())
    const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
            Authorization: consumer.authHeader(
                url.toString(),
                oauthAccessToken,
                oauthAccessTokenSecret,
                'GET'
            )
        }
    };

    const client = url.protocol === 'https:' ? https : http;

    const request = client.request(options, (response) => {
        let data = '';

        response.on('data', (chunk) => {
            data += chunk;
        });

        response.on('end', () => {
            if (response.statusCode !== 200) {
                console.error('Error accessing Twitter API:', response.statusMessage);
                res.status(500).send('Error accessing Twitter API');
            } else {
                const parsedData = JSON.parse(data);
                // Use the returned data as needed
                res.json(parsedData);
            }
        });
    });

    request.on('error', (error) => {
        console.error('Error accessing Twitter API:', error);
        res.status(500).send('Error accessing Twitter API');
    });

    request.end();

});

// Start the server
const server = http.createServer(app);
// If you have an SSL certificate, you can use HTTPS instead
// const server = https.createServer({ cert: fs.readFileSync('path/to/cert.pem'), key: fs.readFileSync('path/to/key.pem') }, app);


//app.use(require('./twitter'));


app.all('*', function (req, res) {
    console.log('Accessing: ', req.path)
    res.redirect('/');
});

process.on('uncaughtException', function (err) {
    console.log('uncaughtException: ' + err);
});

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});