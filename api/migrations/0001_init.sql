CREATE TABLE homes (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE members (
  id TEXT NOT NULL PRIMARY KEY,
  home_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT members_home_fk FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
  CONSTRAINT members_position_nonnegative CHECK (position >= 0),
  CONSTRAINT members_home_position_unique UNIQUE (home_id, position)
);

CREATE TABLE bills (
  id TEXT NOT NULL PRIMARY KEY,
  home_id TEXT NOT NULL,
  title TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT bills_home_fk FOREIGN KEY (home_id) REFERENCES homes(id) ON DELETE CASCADE,
  CONSTRAINT bills_total_positive CHECK (total_cents > 0)
);

CREATE TABLE shares (
  id TEXT NOT NULL PRIMARY KEY,
  bill_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_at TEXT,
  paid_by_key TEXT,
  CONSTRAINT shares_bill_fk FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
  CONSTRAINT shares_member_fk FOREIGN KEY (member_id) REFERENCES members(id),
  CONSTRAINT shares_amount_nonnegative CHECK (amount_cents >= 0),
  CONSTRAINT shares_bill_member_unique UNIQUE (bill_id, member_id)
);
