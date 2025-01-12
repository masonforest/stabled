CREATE TYPE currency AS ENUM(
    'usd'
);

-- CREATE TYPE account_type AS ENUM(
--     'user',
--     'magic_link',
-- );

CREATE TABLE currencies(
    currency currency PRIMARY KEY,
    decimals smallint
);

CREATE TABLE accounts(
    id serial PRIMARY KEY,
    address bytea UNIQUE,
    is_magic_link BOOLEAN,
    nonce bigint NOT NULL DEFAULT 0
);

CREATE TABLE balances(
    account_id int,
    currency currency,
    value bigint NOT NULL DEFAULT 0,
    UNIQUE (account_id, currency),
    PRIMARY KEY (account_id, currency)
);

CREATE TABLE hot_wallets(
    id serial PRIMARY KEY,
    address varchar(62)
);

CREATE TABLE peers(
    id serial PRIMARY KEY,
    is_self boolean,
    address inet
);

CREATE TABLE bitcoin_blocks(
    id serial PRIMARY KEY,
    height int,
    hash BYTEA UNIQUE CHECK (octet_length(hash) = 32)
);

CREATE TABLE deposits(
    id serial PRIMARY KEY,
    bitcoin_transaction_hash bytea UNIQUE CHECK (octet_length(bitcoin_transaction_hash) = 32),
    bitcoin_block_id int REFERENCES bitcoin_blocks(id),
    value bigint
);

CREATE TABLE blocks(
    height serial PRIMARY KEY,
    hash BYTEA UNIQUE CHECK (octet_length(hash) = 32),
    bitcoin_block_id int REFERENCES bitcoin_blocks(id),
    bitcoin_exchange_rate bigint,
    hash_state bytea,
    timestamp timestamp
);

CREATE TABLE utxos(
    id serial PRIMARY KEY,
    account_id int NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    transaction_id bytea UNIQUE CHECK (octet_length(transaction_id) = 32) NOT NULL,
    vout int NOT NULL,
    block_height int REFERENCES blocks(height) NOT NULL,
    redeemed boolean NOT NULL DEFAULT FALSE,
    value bigint NOT NULL
);


CREATE TABLE exchange_rates(
    currency currency,
    block_height int REFERENCES blocks(height),
    value bigint
);

CREATE TABLE withdrawls(
    hash BYTEA UNIQUE CHECK (octet_length(hash) = 32) PRIMARY KEY,
    block_height int REFERENCES blocks(height),
    value bigint
);

CREATE TABLE ledger(
    id bigserial PRIMARY KEY,
    currency currency,
    payor_id int NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    recipient_id int NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    value bigint NOT NULL
);

CREATE TABLE magic_links(
    id bigserial PRIMARY KEY,
    ledger_id int NOT NULL REFERENCES ledger(id) ON DELETE RESTRICT
);

CREATE TABLE signatures(
    transaction_id int NOT NULL REFERENCES ledger(id) ON DELETE RESTRICT,
    account_id bigint NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    nonce bigint,
    signature bytea CHECK (octet_length(signature) = 65)
);

CREATE FUNCTION account_address(account_id int)
    RETURNS bytea
    AS $$
DECLARE
    account_address bytea;
BEGIN
    SELECT address INTO account_address FROM accounts where accounts.id = account_id;
    RETURN account_address;
END;
$$
LANGUAGE plpgsql;

CREATE FUNCTION account_id(address_ bytea)
    RETURNS int
    AS $$
DECLARE
    account_id int;
BEGIN
    WITH new_account AS (
INSERT INTO accounts(address)
        SELECT
            $1
        WHERE
            NOT EXISTS (
                SELECT
                    1
                FROM
                    accounts
                WHERE
                    address = $1)
            RETURNING
                id
)
    SELECT
        id INTO account_id
    FROM
        new_account
    UNION
    SELECT
        id
    FROM
        accounts
    WHERE
        address = $1
    LIMIT 1;
    RETURN account_id;
END;
$$
LANGUAGE plpgsql;

CREATE FUNCTION current_block()
    RETURNS int
    AS $$
    SELECT
        MAX(height)
    FROM
        blocks
$$
LANGUAGE sql;

CREATE FUNCTION currency_decimal_multiplier(currency currency)
    RETURNS int
    AS $$
    SELECT
(10 ^(
                SELECT
                    decimals
                FROM currencies
                WHERE
                    currencies.currency = $1))
$$
LANGUAGE sql;

CREATE FUNCTION satoshis_to_currency(currency currency, value bigint)
    RETURNS bigint
    AS $$
    SELECT
((value * $2) +(50000000)) / 100000000
    FROM
        exchange_rates
    WHERE
        currency = $1
        AND block_height = current_block()
$$
LANGUAGE sql;

CREATE FUNCTION currency_to_satoshis(currency currency, value bigint)
    RETURNS bigint
    AS $$
    SELECT
((($2 * 100000000) - 50000000) / exchange_rates.value)
    FROM
        exchange_rates
    WHERE
        currency = $1
        AND block_height = current_block();
$$
LANGUAGE sql;

CREATE FUNCTION balance(account_id bigint, currency currency)
    RETURNS int
    AS $$
    SELECT
        COALESCE((
            SELECT
                value
            FROM balances
            WHERE
                balances.account_id = $1
                AND balances.currency = $2), 0)
$$
LANGUAGE sql;

CREATE FUNCTION validate_entry()
    RETURNS TRIGGER
    AS $$
BEGIN
    IF balance(NEW.payor_id, NEW.currency) < NEW.value AND NEW.payor_id != system_address() THEN
        RAISE EXCEPTION 'Payor has insufficient funds';
    END IF;
    RETURN NEW;
END;
$$
LANGUAGE plpgsql;

CREATE TRIGGER validate_before_insert
    BEFORE INSERT ON ledger
    FOR EACH ROW
    EXECUTE FUNCTION validate_entry();

CREATE FUNCTION update_account_balances()
    RETURNS TRIGGER
    AS $$
BEGIN
    INSERT INTO balances(account_id, currency, value)
        VALUES(NEW.recipient_id, NEW.currency, NEW.value)
    ON CONFLICT(account_id, currency)
        DO UPDATE SET
            value = balances.value + NEW.value;
    INSERT INTO balances(account_id, currency, value)
        VALUES(NEW.payor_id, NEW.currency, - NEW.value)
    ON CONFLICT(account_id, currency)
        DO UPDATE SET
            value = balances.value - NEW.value;
    RETURN NEW;
END;
$$
LANGUAGE plpgsql;

CREATE TRIGGER update_balances_after_insert
    AFTER INSERT ON ledger
    FOR EACH ROW
    EXECUTE FUNCTION update_account_balances();

INSERT INTO accounts(address)
    VALUES ('\x0000000000000000000000000000000000');

INSERT INTO currencies(currency, decimals)
    VALUES ('usd', 2);

CREATE FUNCTION system_address()
    RETURNS integer
    AS $$
    SELECT
        id
    FROM
        accounts
    WHERE
        address = '\x0000000000000000000000000000000000'
$$
LANGUAGE sql
IMMUTABLE;

