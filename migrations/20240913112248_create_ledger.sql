CREATE TYPE token_type AS ENUM ('usd', 'snt');
CREATE TYPE account_type AS ENUM ('user', 'usd_liability');

CREATE TABLE accounts(
  id SERIAL PRIMARY KEY, 
  account_type account_type,
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

CREATE TABLE blocks(
  number SERIAL PRIMARY KEY,
  hash BYTEA UNIQUE CHECK (octet_length(hash) = 32),
  hash_state BYTEA,
  timestamp TIMESTAMP
);

CREATE TABLE transactions(
  id SERIAL PRIMARY KEY, 
  nonce BIGINT NOT NULL,
  token_type token_type,
  debtor_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT, 
  creditor_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  value BIGINT NOT NULL,
  signature BYTEA CHECK (octet_length(signature) = 65)
);

CREATE FUNCTION account_id(address bytea)
RETURNS int AS $$
    WITH new_accounts AS (
  INSERT INTO accounts (address)
  VALUES ($1)
  ON CONFLICT (address) DO NOTHING
  RETURNING *
)
SELECT id FROM new_accounts
UNION
SELECT id FROM accounts
  WHERE accounts.address = $1
$$ LANGUAGE sql;

CREATE FUNCTION validate_entry() RETURNS TRIGGER AS $$ BEGIN
    IF (SELECT value FROM balances WHERE account_id = NEW.creditor_id AND token_type = NEW.token_type) < NEW.value THEN RAISE EXCEPTION 'Debitor has insufficient funds';
END IF;
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER validate_before_insert BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION validate_entry();

CREATE FUNCTION update_account_balances() RETURNS TRIGGER AS $$ BEGIN 
INSERT INTO balances (
    account_id,
    token_type,
    value
) VALUES (NEW.debtor_id, NEW.token_type, NEW.value)
ON CONFLICT (account_id, token_type) DO UPDATE
SET value = balances.value + NEW.value; 
INSERT INTO balances (
    account_id,
    token_type,
    value
) VALUES (NEW.creditor_id, NEW.token_type, NEW.value)
ON CONFLICT (account_id, token_type) DO UPDATE
SET value = balances.value - NEW.value;
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER update_balances_after_insert 
AFTER 
  INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION update_account_balances();


INSERT INTO accounts (account_type) VALUES('usd_liability');
CREATE FUNCTION usd_liability_account()
  RETURNS integer AS
  $$SELECT id from accounts where account_type = 'usd_liability' $$ LANGUAGE sql IMMUTABLE;