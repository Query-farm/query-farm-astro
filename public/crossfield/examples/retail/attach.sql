-- Both revisions use the same physical rows. Changing aliases does not change
-- logical dataset/provider identities. Dependencies must already exist.
ATTACH 'jaffle-v1.package.json' AS jaffle_old (
    TYPE crossfield, MODEL_VERSION '1',
    BINDINGS '{"sales":"warehouse","reference":"warehouse"}'
);
ATTACH 'jaffle-v2.package.json' AS jaffle_current (
    TYPE crossfield, MODEL_VERSION '2',
    BINDINGS '{"sales":"warehouse","reference":"warehouse"}'
);
