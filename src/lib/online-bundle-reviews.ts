import type { BookReview } from "./reviews";

// Customer feedback supplied by the owner for the four-book bundle.
const feedback: readonly (readonly [name: string, text: string, attribution?: string])[] = [
  ["Rishabh Khanna", "I wanted to start a restaurant but had no idea how to build an online presence. These books helped me understand the basics of selling and promoting a business online."],
  ["Sneha Agarwal", "Honestly, mujhe online business ke baare mein kuch bhi nahi pata tha. Books kaafi simple language mein hain aur beginners ke liye helpful hain."],
  ["Arjun Mehta", "As someone building a home decor brand, I found the structured approach useful. It helped me organise my thoughts around launching online.", "Founder – UrbanNest Home"],
  ["Kavya Bansal", "I was planning to start an Instagram jewellery store. The bundle gave me a much clearer understanding of where to begin."],
  ["Mohit Sharma", "₹499 mein four books is a good deal. Sab kuch step by step explain kiya hai. Especially useful if you're starting from zero."],
  ["Priyanshi Kapoor", "I'm working on a skincare brand, and the books gave me a helpful introduction to online selling and reaching customers.", "Owner – Bloom & Blush"],
  ["Aditya Jain", "I've watched countless YouTube videos about starting a business, but I liked having the fundamentals organised in one place."],
  ["Nidhi Verma", "Main apna clothing boutique online le jaana chahti thi. Kaafi doubts clear hue, especially regarding how to get started."],
  ["Devansh Shah", "I wanted to grow my coffee business beyond local customers. This was a useful beginner's perspective on building online sales.", "Founder – BrewLane Coffee"],
  ["Ishita Malhotra", "The writing is straightforward and doesn't overwhelm you with technical terminology. Good for first-time entrepreneurs."],
  ["Rahul Sethi", "Pehle online business start karna bahut complicated lagta tha. Ab at least mujhe samajh aa gaya hai ki planning kahan se shuru karni hai."],
  ["Tanisha Rao", "As a small handmade-products business owner, I appreciated the simple explanations and organised content.", "Owner – Little Loom Studio"],
  ["Harsh Gupta", "I was exploring a cloud kitchen idea and wanted to understand digital selling. The bundle was a good introduction."],
  ["Simran Kaur", "Books ki language kaafi easy hai. Agar aap student ho aur side business start karne ka soch rahe ho, it's a good starting point."],
  ["Yash Patel", "Helpful for understanding the basic decisions involved in taking a fashion brand online.", "Founder – TerraThreads"],
  ["Pooja Nair", "I wanted to sell homemade candles but didn't know how online businesses work. The books made the process easier to understand."],
  ["Aman Chawla", "Kaafi practical information hai. Mujhe achha laga ki content unnecessarily complicated nahi banaya gaya."],
  ["Riya Desai", "The bundle is a useful learning resource for small-business owners who are just beginning their online journey.", "Owner – Petal & Pine Gifts"],
];

export const onlineBundleReviews: readonly BookReview[] = feedback.map(([name, text, attribution], index) => ({
  id: `online-bundle-${index + 1}`,
  productId: "start-selling-online-bundle",
  name,
  attribution,
  rating: 5,
  text,
  status: "published",
  provenance: "reader-feedback",
}));
