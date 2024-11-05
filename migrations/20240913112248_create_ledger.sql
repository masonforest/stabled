CREATE TYPE token_type AS ENUM ('usd', 'snt');

CREATE TABLE accounts(
  id SERIAL PRIMARY KEY, 
  address BYTEA UNIQUE CHECK (octet_length(address) = 33),
  nonce BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE balances(
  account_id INT, 
  token_type token_type,
  value BIGINT NOT NULL DEFAULT 0,
  UNIQUE (account_id, token_type),
  PRIMARY KEY(account_id, token_type)
);

CREATE TABLE hot_wallets(
  id SERIAL PRIMARY KEY, 
  address varchar(62) 
);

CREATE TABLE peers(
  id SERIAL PRIMARY KEY, 
  is_self BOOLEAN,
  address INET
);

CREATE TABLE bitcoin_blocks (
  id SERIAL PRIMARY KEY, 
  height INT,
  hash BYTEA UNIQUE CHECK (octet_length(hash) = 32)
);

CREATE TABLE deposits(
  id SERIAL PRIMARY KEY, 
  bitcoin_transaction_hash BYTEA UNIQUE CHECK (octet_length(bitcoin_transaction_hash) = 32),
  bitcoin_block_id INT REFERENCES bitcoin_blocks(id), 
  value BIGINT
);

CREATE TABLE blocks (
  height SERIAL PRIMARY KEY,
  hash BYTEA UNIQUE CHECK (octet_length(hash) = 32),
  bitcoin_block_id INT REFERENCES bitcoin_blocks(id), 
  bitcoin_exchange_rate BIGINT,
  hash_state BYTEA,
  timestamp TIMESTAMP
);

CREATE TABLE withdrawls(
  hash BYTEA UNIQUE CHECK (octet_length(hash) = 32)  PRIMARY KEY,
  block_height INT REFERENCES blocks(height), 
  value BIGINT
);

CREATE TABLE ledger(
  id BIGSERIAL PRIMARY KEY, 
  token_type token_type,
  payor_id INT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  recipient_id INT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT, 
  value BIGINT NOT NULL
);

CREATE TABLE signatures(
  transaction_id INT NOT NULL REFERENCES ledger(id) ON DELETE RESTRICT, 
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  nonce BIGINT,
  signature BYTEA CHECK (octet_length(signature) = 65)
);

CREATE FUNCTION account_id(address_ bytea)
RETURNS int AS $$
DECLARE
    account_id int;
BEGIN
    WITH new_account AS (
        INSERT INTO accounts (address)
        SELECT $1
        WHERE NOT EXISTS (
            SELECT 1 FROM accounts WHERE address = $1
        )
        RETURNING id
    )
    SELECT id INTO account_id
    FROM new_account
    UNION
    SELECT id FROM accounts WHERE address = $1
    LIMIT 1;

    RETURN account_id;
END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION balance(account_id BIGINT, token_type token_type)
RETURNS int AS $$
SELECT COALESCE((SELECT value FROM balances WHERE balances.account_id = $1 AND balances.token_type = $2), 0)
$$ LANGUAGE sql;

CREATE FUNCTION validate_entry() RETURNS TRIGGER AS $$ BEGIN
    IF balance(NEW.payor_id, NEW.token_type) < NEW.value AND
     NEW.payor_id != system_address() 
    THEN RAISE EXCEPTION 'Payor has insufficient funds';
END IF;
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER validate_before_insert BEFORE INSERT ON ledger FOR EACH ROW EXECUTE FUNCTION validate_entry();

CREATE FUNCTION update_account_balances() RETURNS TRIGGER AS $$ BEGIN 
INSERT INTO balances (
    account_id,
    token_type,
    value
) VALUES (NEW.recipient_id, NEW.token_type, NEW.value)
ON CONFLICT (account_id, token_type) DO UPDATE
SET value = balances.value + NEW.value; 
INSERT INTO balances (
    account_id,
    token_type,
    value
) VALUES (NEW.payor_id, NEW.token_type, -NEW.value)
ON CONFLICT (account_id, token_type) DO UPDATE
SET value = balances.value - NEW.value;
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER update_balances_after_insert 
AFTER 
  INSERT ON ledger FOR EACH ROW EXECUTE FUNCTION update_account_balances();


INSERT INTO accounts (address) VALUES('\x000000000000000000000000000000000000000000000000000000000000000000');
CREATE FUNCTION system_address()
  RETURNS integer AS
  $$SELECT id from accounts where address = '\x000000000000000000000000000000000000000000000000000000000000000000' $$ LANGUAGE sql IMMUTABLE;