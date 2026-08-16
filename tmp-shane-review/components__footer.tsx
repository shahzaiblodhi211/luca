"use client";


import React from "react";
import Link from "next/link";
import { useState } from "react";
import { Facebook, Twitter, Linkedin, Instagram, Youtube } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";

export function Footer() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubscribed(true);
      setEmail("");
      setTimeout(() => setSubscribed(false), 4000);
    }
  };

  return (
    <footer id="contact" className="w-full bg-black border-t border-gray-900 pt-16 pb-12">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-[100px]">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-12 pb-12">
          {/* Brand & Info Column */}
          <div className="lg:col-span-5 space-y-6">
            <Link href="/" className="inline-block">
              <BrandLogo width={220} height={30} />
              <span className="sr-only">
                <img src="/api/attachments/DzyEXWY4IhK24o9W7p5b0" alt="Shane Hall Logo" />
                <img src="/api/attachments/p9eFjrYiHpspARttp1EJQ" alt="Shane Hall" />
              </span>
            </Link>

            <p className="text-[#c1c1c1] font-light text-[14px] leading-[22px] max-w-[450px]">
              Shane Hall is a dynamic mentor dedicated to helping you unlock your
              potential through fitness, art, and entrepreneurial success. Join a
              community driven by passion and excellence, and transform your
              life with guidance from the best in the field.
            </p>

            <div className="space-y-1 text-[14px] text-white font-light">
              <p>
                <span className="font-semibold text-white">Contact:</span> For
                inquiries, please email us at:{" "}
                <a
                  href="mailto:contact@shanehall.com"
                  className="text-[#00a2ed] hover:underline"
                >
                  contact@shanehall.com
                </a>
              </p>
              <p>
                <span className="font-semibold text-white">Phone:</span>{" "}
                <span className="text-gray-400">***********</span>
              </p>
            </div>
          </div>

          {/* Quick Links Column */}
          <div className="lg:col-span-3 space-y-4">
            <h3 className="text-white font-bold text-[21px] leading-[26px]">
              Quick Links
            </h3>
            <ul className="space-y-2 text-[14px] text-[#b4b4b4]">
              <li>
                <Link href="/" className="hover:text-[#00a2ed] transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="#about" className="hover:text-[#00a2ed] transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link href="#podcast" className="hover:text-[#00a2ed] transition-colors">
                  Podcast
                </Link>
              </li>
              <li>
                <Link href="#articles" className="hover:text-[#00a2ed] transition-colors">
                  Articles
                </Link>
              </li>
              <li>
                <Link href="#merch" className="hover:text-[#00a2ed] transition-colors">
                  Merch
                </Link>
              </li>
              <li>
                <Link href="#contact" className="hover:text-[#00a2ed] transition-colors">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Newsletter Column */}
          <div className="lg:col-span-4 space-y-4">
            <h3 className="text-white font-bold text-[21px] leading-[26px]">
              Subscribe to Our <span className="text-[#00a2ed]">Newsletter</span>
            </h3>

            <p className="text-[#c1c1c1] font-light text-[14px] leading-[20px]">
              Stay updated with our latest insights, articles, and exclusive
              offers. Join our newsletter to receive inspiration and tips straight
              to your inbox.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 pt-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                className="bg-white text-black px-4 py-2.5 rounded-sm text-[14px] focus:outline-none focus:ring-2 focus:ring-[#00a2ed] flex-1"
              />
              <button
                type="submit"
                className="bg-[#00a2ed] hover:bg-[#1597d4] text-white font-semibold px-6 py-2.5 rounded-sm text-[14px] transition-colors shrink-0"
              >
                Subscribe
              </button>
            </form>

            {subscribed && (
              <p className="text-emerald-400 text-xs font-semibold">
                ✓ Thank you for subscribing!
              </p>
            )}

            {/* Social Connect */}
            <div className="pt-4">
              <p className="text-white font-bold text-[14px] mb-3">Connect with Us</p>
              <div className="flex items-center space-x-4 text-white">
                <a href="https://facebook.com" className="hover:text-[#00a2ed] transition-colors">
                  <Facebook size={20} />
                </a>
                <a href="https://twitter.com" className="hover:text-[#00a2ed] transition-colors">
                  <Twitter size={20} />
                </a>
                <a href="https://linkedin.com" className="hover:text-[#00a2ed] transition-colors">
                  <Linkedin size={20} />
                </a>
                <a href="https://instagram.com" className="hover:text-[#00a2ed] transition-colors">
                  <Instagram size={20} />
                </a>
                <a href="https://youtube.com" className="hover:text-[#00a2ed] transition-colors">
                  <Youtube size={20} />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Copyright */}
        <div className="border-t border-gray-900 pt-8 text-center text-[14px] text-gray-500">
          © 2024{" "}
          <Link href="/" className="text-[#00a2ed] hover:underline">
            Shane Hall
          </Link>
          . All Rights Reserved.
        </div>
      </div>
    </footer>
  );
}
