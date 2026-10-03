import { redactSecrets, isSensitiveFilename } from '../../src/security/secretDetection';
import { expect } from 'chai';

describe('redactSecrets', () => {
  it('redacts RSA private keys', () => {
    const input = '-----BEGIN RSA PRIVATE KEY-----\nMIIBog...\n-----END RSA PRIVATE KEY-----';
    const { redacted, found } = redactSecrets(input);
    expect(redacted).to.not.include('BEGIN RSA PRIVATE KEY');
    expect(redacted).to.include('[REDACTED_SECRET]');
    expect(found).to.equal(1);
  });

  it('redacts EC private keys', () => {
    const input = '-----BEGIN EC PRIVATE KEY-----\nMHQCA...\n-----END EC PRIVATE KEY-----';
    const { redacted, found } = redactSecrets(input);
    expect(redacted).to.not.include('BEGIN EC PRIVATE KEY');
    expect(found).to.equal(1);
  });

  it('redacts OPENSSH private keys', () => {
    const input = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3Blbn...\n-----END OPENSSH PRIVATE KEY-----';
    const { redacted, found } = redactSecrets(input);
    expect(redacted).to.not.include('BEGIN OPENSSH PRIVATE KEY');
    expect(found).to.equal(1);
  });

  it('redacts DSA private keys', () => {
    const input = '-----BEGIN DSA PRIVATE KEY-----\nMIIBug...\n-----END DSA PRIVATE KEY-----';
    const { redacted, found } = redactSecrets(input);
    expect(redacted).to.not.include('BEGIN DSA PRIVATE KEY');
    expect(found).to.equal(1);
  });

  it('redacts PGP private keys', () => {
    const input = '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: ...\n-----END PGP PRIVATE KEY BLOCK-----';
    const { redacted, found } = redactSecrets(input);
    expect(redacted).to.not.include('BEGIN PGP PRIVATE KEY');
    expect(found).to.equal(1);
  });

  it('redacts api key assignments', () => {
    const input = 'api_key = "abcdefghijklmnopqrstuvwx"';
    const { redacted, found } = redactSecrets(input);
    expect(redacted).to.include('[REDACTED_SECRET]');
    expect(found).to.equal(1);
  });

  it('redacts apikey assignments', () => {
    const input = 'apikey: "abcdefghijklmnopqrstuvwx"';
    const { redacted, found } = redactSecrets(input);
    expect(redacted).to.include('[REDACTED_SECRET]');
    expect(found).to.equal(1);
  });

  it('redacts secret assignments', () => {
    const input = 'secret = "my-super-secret-value-here"';
    const { redacted, found } = redactSecrets(input);
    expect(redacted).to.include('[REDACTED_SECRET]');
    expect(found).to.equal(1);
  });

  it('redacts token assignments', () => {
    const input = 'token: "my-token-value-here"';
    const { redacted, found } = redactSecrets(input);
    expect(redacted).to.include('[REDACTED_SECRET]');
    expect(found).to.equal(1);
  });

  it('redacts password assignments', () => {
    const input = 'password = "P@ssw0rd123!"';
    const { redacted, found } = redactSecrets(input);
    expect(redacted).to.include('[REDACTED_SECRET]');
    expect(found).to.equal(1);
  });

  it('redacts passwd assignments', () => {
    const input = 'passwd: "admin123"';
    const { redacted, found } = redactSecrets(input);
    expect(redacted).to.include('[REDACTED_SECRET]');
    expect(found).to.equal(1);
  });

  it('redacts AWS access key ids', () => {
    const input = 'AKIAIOSFODNN7EXAMPLE';
    const { redacted, found } = redactSecrets(input);
    expect(redacted).to.include('[REDACTED_SECRET]');
    expect(found).to.equal(1);
  });

  it('redacts OpenAI-style secret keys', () => {
    const input = 'sk-abcdefghijklmnopqrstuvwxyz1234567890';
    const { redacted, found } = redactSecrets(input);
    expect(redacted).to.include('[REDACTED_SECRET]');
    expect(found).to.equal(1);
  });

  it('redacts GitHub personal access tokens', () => {
    const input = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn';
    const { redacted, found } = redactSecrets(input);
    expect(redacted).to.include('[REDACTED_SECRET]');
    expect(found).to.equal(1);
  });

  it('redacts Slack tokens', () => {
    // Assembled at runtime so no token-shaped literal is committed to the repo.
    // GitHub push protection rejects Slack token patterns even in test fixtures.
    const input = ['xox', 'b-123456789012-123456789012-ABCDEFGHIJKLMNOPQRST'].join('');
    const { redacted, found } = redactSecrets(input);
    expect(redacted).to.include('[REDACTED_SECRET]');
    expect(found).to.equal(1);
  });

  it('redacts Google API keys', () => {
    const input = 'AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY';
    const { redacted, found } = redactSecrets(input);
    expect(redacted).to.include('[REDACTED_SECRET]');
    expect(found).to.equal(1);
  });

  it('redacts JWT-shaped tokens', () => {
    const input = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const { redacted, found } = redactSecrets(input);
    expect(redacted).to.include('[REDACTED_SECRET]');
    expect(found).to.equal(1);
  });

  it('redacts multiple secrets in one string', () => {
    const input = 'api_key = "abcdefghijklmnopqrstuvwx" and token: "my-token-value-here"';
    const { redacted, found } = redactSecrets(input);
    expect(redacted).to.include('[REDACTED_SECRET]');
    expect(found).to.equal(2);
  });

  it('leaves normal text untouched', () => {
    const input = 'Hello world, this is a normal string.';
    const { redacted, found } = redactSecrets(input);
    expect(redacted).to.equal(input);
    expect(found).to.equal(0);
  });

  it('returns count of redacted secrets', () => {
    const input = 'key1=AKIAIOSFODNN7EXAMPLE key2=AKIAIOSFODNN7EXAMPLE';
    const { found } = redactSecrets(input);
    expect(found).to.equal(2);
  });
});

describe('isSensitiveFilename', () => {
  it('matches .env', () => {
    expect(isSensitiveFilename('.env')).to.equal(true);
  });

  it('matches .env.local', () => {
    expect(isSensitiveFilename('.env.local')).to.equal(true);
  });

  it('matches .pem files', () => {
    expect(isSensitiveFilename('key.pem')).to.equal(true);
  });

  it('matches .key files', () => {
    expect(isSensitiveFilename('private.key')).to.equal(true);
  });

  it('matches .pfx files', () => {
    expect(isSensitiveFilename('cert.pfx')).to.equal(true);
  });

  it('matches .p12 files', () => {
    expect(isSensitiveFilename('keystore.p12')).to.equal(true);
  });

  it('matches id_rsa', () => {
    expect(isSensitiveFilename('id_rsa')).to.equal(true);
  });

  it('matches id_ed25519', () => {
    expect(isSensitiveFilename('id_ed25519')).to.equal(true);
  });

  it('matches credentials.json', () => {
    expect(isSensitiveFilename('credentials.json')).to.equal(true);
  });

  it('matches secrets.json', () => {
    expect(isSensitiveFilename('secrets.json')).to.equal(true);
  });

  it('matches secrets.yaml', () => {
    expect(isSensitiveFilename('secrets.yaml')).to.equal(true);
  });

  it('matches secrets.yml', () => {
    expect(isSensitiveFilename('secrets.yml')).to.equal(true);
  });

  it('matches nested paths', () => {
    expect(isSensitiveFilename('config/.env')).to.equal(true);
    expect(isSensitiveFilename('src/keys/id_rsa')).to.equal(true);
  });

  it('rejects normal files', () => {
    expect(isSensitiveFilename('package.json')).to.equal(false);
    expect(isSensitiveFilename('README.md')).to.equal(false);
    expect(isSensitiveFilename('src/index.ts')).to.equal(false);
    expect(isSensitiveFilename('.gitignore')).to.equal(false);
  });
});
