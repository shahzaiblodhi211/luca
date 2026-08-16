"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full bg-black/95 backdrop-blur-md border-b border-[#00a2ed]">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-[120px] h-[80px] flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="relative flex items-center gap-2 group">
          <BrandLogo width={166} height={22} />
          <span className="sr-only">
            <img src="/api/attachments/eO859-oKpMNUU7opsXYcO" alt="Shane Hall Logo" />
            <img src="/api/attachments/HgUo2tOiYUBPn9_qi8JC9" alt="Shane Hall" />
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center space-x-10">
          <Link
            href="/"
            className="text-[16px] leading-[22px] font-semibold text-[#00a2ed] hover:opacity-80 transition-opacity"
          >
            Home
          </Link>
          <Link
            href="#about"
            className="text-[16px] leading-[22px] font-normal text-[#b4b4b4] hover:text-[#00a2ed] transition-colors"
          >
            About
          </Link>
          <Link
            href="#podcast"
            className="text-[16px] leading-[22px] font-normal text-[#b4b4b4] hover:text-[#00a2ed] transition-colors"
          >
            Podcast
          </Link>
          <Link
            href="#articles"
            className="text-[16px] leading-[22px] font-normal text-[#b4b4b4] hover:text-[#00a2ed] transition-colors"
          >
            Articles
          </Link>
          <Link
            href="#merch"
            className="text-[16px] leading-[22px] font-normal text-[#b4b4b4] hover:text-[#00a2ed] transition-colors"
          >
            Merch
          </Link>
          <Link
            href="#contact"
            className="text-[16px] leading-[22px] font-normal text-[#b4b4b4] hover:text-[#00a2ed] transition-colors"
          >
            Contact
          </Link>
        </nav>

        {/* Mobile menu button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="md:hidden text-white p-2 focus:outline-none"
          aria-label="Toggle Navigation"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {isOpen && (
        <div className="md:hidden bg-black/98 border-b border-[#00a2ed] px-6 py-4 space-y-4">
          <Link
            href="/"
            onClick={() => setIsOpen(false)}
            className="block text-[#00a2ed] font-semibold text-lg py-1"
          >
            Home
          </Link>
          <Link
            href="#about"
            onClick={() => setIsOpen(false)}
            className="block text-[#b4b4b4] hover:text-[#00a2ed] text-lg py-1"
          >
            About
          </Link>
          <Link
            href="#podcast"
            onClick={() => setIsOpen(false)}
            className="block text-[#b4b4b4] hover:text-[#00a2ed] text-lg py-1"
          >
            Podcast
          </Link>
          <Link
            href="#articles"
            onClick={() => setIsOpen(false)}
            className="block text-[#b4b4b4] hover:text-[#00a2ed] text-lg py-1"
          >
            Articles
          </Link>
          <Link
            href="#merch"
            onClick={() => setIsOpen(false)}
            className="block text-[#b4b4b4] hover:text-[#00a2ed] text-lg py-1"
          >
            Merch
          </Link>
          <Link
            href="#contact"
            onClick={() => setIsOpen(false)}
            className="block text-[#b4b4b4] hover:text-[#00a2ed] text-lg py-1"
          >
            Contact
          </Link>
        </div>
      )}
    </header>
  );
}
