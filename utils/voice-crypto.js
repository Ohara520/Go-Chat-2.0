// utils/voice-crypto.js — AES-256-GCM 加密/解密工具
// 用于加密用户的 ElevenLabs API Key，密钥不得出现在日志、返回值、浏览器中

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // GCM 推荐 12 字节
const TAG_LENGTH = 16;  // GCM 认证标签 16 字节
const KEY_LENGTH = 32;  // AES-256 需要 32 字节

/**
 * 从环境变量获取加密密钥（32 字节 base64 编码）
 * @returns {Buffer} 32 字节密钥
 * @throws {Error} 如果环境变量未配置或格式错误
 */
function getEncryptionKey() {
  const secret = process.env.VOICE_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('VOICE_KEY_ENCRYPTION_SECRET not configured');
  }

  let keyBuffer;
  try {
    keyBuffer = Buffer.from(secret, 'base64');
  } catch (e) {
    throw new Error('VOICE_KEY_ENCRYPTION_SECRET must be base64 encoded');
  }

  if (keyBuffer.length !== KEY_LENGTH) {
    throw new Error(`VOICE_KEY_ENCRYPTION_SECRET must be ${KEY_LENGTH} bytes (got ${keyBuffer.length})`);
  }

  return keyBuffer;
}

/**
 * 加密明文 API Key
 * @param {string} plaintext - 明文 API Key
 * @returns {{ ciphertext: string, iv: string, authTag: string }} 加密后的三件套（hex 编码）
 * @throws {Error} 如果加密失败
 */
export function encrypt(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('plaintext must be a non-empty string');
  }

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  } catch (err) {
    // 不暴露原始错误信息（可能泄露密钥信息）
    throw new Error('Encryption failed');
  }
}

/**
 * 解密 API Key
 * @param {string} ciphertext - 密文（hex 编码）
 * @param {string} iv - 初始化向量（hex 编码）
 * @param {string} authTag - 认证标签（hex 编码）
 * @returns {string} 明文 API Key
 * @throws {Error} 如果解密失败或完整性校验失败
 */
export function decrypt(ciphertext, iv, authTag) {
  if (!ciphertext || !iv || !authTag) {
    throw new Error('Missing required decryption parameters');
  }

  try {
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    // GCM 认证失败或密钥不匹配
    throw new Error('Decryption failed or integrity check failed');
  }
}

/**
 * 验证加密密钥是否可用（用于启动时自检）
 * @returns {boolean} 密钥是否有效
 */
export function validateEncryptionKey() {
  try {
    getEncryptionKey();
    return true;
  } catch (e) {
    return false;
  }
}
