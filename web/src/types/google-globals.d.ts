type TokenResponse = {
    access_token?: string;
    error?: string;
};

type TokenClient = {
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type: string }) => void;
    requestAccessToken(options?: { prompt?: '' | 'consent' }): void;
};

declare const google: {
    accounts: {
        oauth2: {
            initTokenClient(config: {
                client_id: string;
                scope: string;
                callback: (response: TokenResponse) => void;
                error_callback?: (error: { type: string }) => void;
            }): TokenClient;
            revoke(token: string, done?: () => void): void;
        };
    };
};
