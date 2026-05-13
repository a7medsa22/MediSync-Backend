export class TestUtils {
  static generateRandomEmail(): string {
    return `test_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
  }

  static generateRandomPhone(): string {
    const prefixes = ['10', '11', '12', '15'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const number = Math.floor(10000000 + Math.random() * 89999999);
    return `+20${prefix}${number}`;
  }

  static generateRandomNationalId(): string {
    // Generate valid Egyptian National ID
    const century = Math.random() > 0.5 ? 2 : 3; // 2 for 19xx, 3 for 20xx
    const year = Math.floor(Math.random() * 100)
      .toString()
      .padStart(2, '0');
    const month = Math.floor(1 + Math.random() * 12)
      .toString()
      .padStart(2, '0');
    const day = Math.floor(1 + Math.random() * 28)
      .toString()
      .padStart(2, '0');
    const govCode = Math.floor(1 + Math.random() * 35)
      .toString()
      .padStart(2, '0');
    const sequence = Math.floor(100 + Math.random() * 900);
    const gender = Math.floor(Math.random() * 10);
    const checksum = Math.floor(Math.random() * 10);

    return `${century}${year}${month}${day}${govCode}${sequence}${gender}${checksum}`;
  }

  static generateStrongPassword(): string {
    const length = 12;
    const charset = {
      lowercase: 'abcdefghijklmnopqrstuvwxyz',
      uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      numbers: '0123456789',
      special: '@$!%*?&',
    };

    let password = '';

    // Ensure at least one of each type
    password +=
      charset.lowercase[Math.floor(Math.random() * charset.lowercase.length)];
    password +=
      charset.uppercase[Math.floor(Math.random() * charset.uppercase.length)];
    password +=
      charset.numbers[Math.floor(Math.random() * charset.numbers.length)];
    password +=
      charset.special[Math.floor(Math.random() * charset.special.length)];

    // Fill the rest randomly
    const allChars = Object.values(charset).join('');
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password
    return password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
  }
}
