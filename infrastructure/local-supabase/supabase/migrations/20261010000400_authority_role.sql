-- PostgreSQL 17 role creation does not automatically permit SET ROLE.
-- The container-local postgres operator gets only this narrow game role.
grant nobi_authority to postgres with set true;
