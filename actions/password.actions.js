"use server";

import crypto from "crypto";
import Password from "@/lib/database/models/password";
import { correctPassword, isAuthenticated } from "./auth.actions";
import connectToDatabase from "@/lib/database/db";
import { getPasswordStrength } from "@/utility/password/password-strength";
import { revalidatePath } from "next/cache";
import moment from "moment";

const algorithm = "aes-256-cbc";
const secretKey = process.env.ENCRYPTION_KEY;
const key = crypto.createHash("sha256").update(secretKey).digest();

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(encryptedText) {
  const [ivHex, encrypted] = encryptedText.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export const addPassword = async (password, source, notes) => {
  const user = await isAuthenticated();
  console.log(user);
  if (!user) return;
  if (!password) return;

  await connectToDatabase();

  const encryptedPassword = encrypt(password);

  const psw = new Password({
    source,
    owner: user,
    password: encryptedPassword,
    strength: getPasswordStrength(password),
    notes,
  });

  await psw.save();

  revalidatePath("/vault");
  return {
    ...psw.toObject(),
    owner: psw.owner.toString(),
    _id: psw._id.toString(),
    password: decrypt(psw.password),
  };
};

export const getDecryptedPassword = async (passwordId) => {
  await connectToDatabase();
  const psw = await Password.findById(passwordId);
  if (!psw) return null;
  const decryptedPassword = decrypt(psw.password);
  return decryptedPassword;
};

export const getPasswordsByUserId = async (userId) => {
  await connectToDatabase();

  const passwords = await Password.find({ owner: userId });

  const hiddenPasswords = passwords.map((psw) => ({
    ...psw.toObject(),
    owner: psw.owner.toString(),
    _id: psw._id.toString(),
    password: null,
    strength: null,
  }));

  return hiddenPasswords;
};

export const getFullPasswordInfo = async (userId, password) => {
  if (!(await correctPassword(userId, password))) throw new Error("AAA");

  const passwords = await Password.find({ owner: userId });

  const shownPasswords = passwords.map((psw) => ({
    ...psw.toObject(),
    owner: psw.owner.toString(),
    _id: psw._id.toString(),
    password: decrypt(psw.password),
  }));

  return shownPasswords;
};

export const getIndividualFullPasswordInfo = async (
  userId,
  password,
  passwordId
) => {
  if (!(await correctPassword(userId, password))) throw new Error("AAA");

  const psw = await Password.findById(passwordId);

  return {
    ...psw.toObject(),
    owner: psw.owner.toString(),
    _id: psw._id.toString(),
    password: decrypt(psw.password),
  };
};

export const getPasswordStrengthPieData = async () => {
  const user = await isAuthenticated();
  const passwords = await Password.find({ owner: user._id });

  const strengthStats = {
    Critical: 0,
    Bad: 0,
    Dubious: 0,
    Good: 0,
    Great: 0,
  };

  passwords.forEach((psw) => {
    strengthStats[psw.strength] = (strengthStats[psw.strength] || 0) + 1;
  });

  const pieData = Object.entries(strengthStats).map(([strength, value]) => ({
    name: `${strength} Passwords`,
    value,
    label: value,
  }));

  return pieData;
};

export const getPasswordsPerDay = async (days = 7) => {
  const user = await isAuthenticated();
  const passwords = await Password.find({ owner: user._id }).sort({
    createdAt: 1,
  });

  const passwordCountByDate = {};

  passwords.forEach((psw) => {
    const date = moment(psw.createdAt).format("YYYY-MM-DD");
    passwordCountByDate[date] = (passwordCountByDate[date] || 0) + 1;
  });

  const startDate = passwords.length
    ? moment(passwords[0].createdAt).startOf("day")
    : moment().subtract(6, "days").startOf("day");

  const endDate = moment().startOf("day");
  const data = [];
  for (let i = 0; i < days; i++) {
    const date = moment().subtract(i, "days").format("YYYY-MM-DD");
    data.push({
      date,
      value: passwordCountByDate[date] || 0,
    });
  }

  return data.reverse();
};

export const getBarChartData = async (userId, password, days = 7) => {
  if (!correctPassword(userId, password)) return;

  const yourPasswords = await getPasswordsPerDay(userId, password, days);

  const allPasswords = await Password.find({
    owner: { $ne: userId },
    createdAt: {
      $gte: moment()
        .subtract(days - 1, "days")
        .startOf("day")
        .toDate(),
    },
  }).sort({ createdAt: 1 });

  const passwordCountByDate = {};
  const userCountByDate = {};

  allPasswords.forEach((psw) => {
    const date = moment(psw.createdAt).format("YYYY-MM-DD");

    passwordCountByDate[date] = (passwordCountByDate[date] || 0) + 1;
    userCountByDate[date] = new Set([
      ...(userCountByDate[date] || new Set()),
      psw.owner.toString(),
    ]);
  });

  const avgPasswordsByDate = {};
  Object.keys(passwordCountByDate).forEach((date) => {
    const totalPasswords = passwordCountByDate[date];
    const uniqueUsers = userCountByDate[date]?.size || 1;
    avgPasswordsByDate[date] = totalPasswords / uniqueUsers;
  });

  const barData = yourPasswords.map(({ date, value }) => ({
    date,
    ["Your passwords"]: value,
    ["Others' passwords"]: Math.round(avgPasswordsByDate[date] || 0),
  }));

  return barData;
};
