export interface JwtPayload {
    id?: string;
    username?: string;
    email?: string;
    timezoneOffset?: number;
    appVersion?: string;
    language?: string;
    tokenJira?: string;
}
