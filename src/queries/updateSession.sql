UPDATE Sessions
SET token = @token, token_secret = @token_secret
WHERE oauthToken = @oauthToken;