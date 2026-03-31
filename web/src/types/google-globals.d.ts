type TokenResponse = {
    access_token: string;
};

type TokenClient = {
    requestAccessToken(options?: { prompt?: string }): void;
};

declare const google: {
    accounts: {
        oauth2: {
            initTokenClient(config: {
                client_id: string;
                scope: string;
                callback: (response: TokenResponse) => void;
            }): TokenClient;
        };
    };
};

declare const gapi: {
    load(api: string, callback: () => void): void;
    client: {
        init(config: { discoveryDocs: string[] }): Promise<void>;
        drive: {
            files: {
                list(params: {
                    spaces: string;
                    fields: string;
                    q: string;
                }): Promise<{
                    result: {
                        files?: Array<{ id?: string | null; name?: string | null }>;
                    };
                }>;
            };
        };
    };
};
