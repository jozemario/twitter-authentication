SELECT token, token_secret
FROM Sessions
WHERE oauthToken = @oauthToken;