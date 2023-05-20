CREATE TABLE Sessions (
    oauthToken NVARCHAR(255) PRIMARY KEY,
    oauthTokenSecret NVARCHAR(255),
    token NVARCHAR(255),
    token_secret NVARCHAR(255)
);