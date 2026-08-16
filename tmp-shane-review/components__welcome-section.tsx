"use client";

import Image from "next/image";

export function WelcomeSection() {
  return (
    <section id="about" className="w-full bg-black py-16 lg:py-24">
      <div className="max-w-[1171px] mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Text */}
          <div className="lg:col-span-7 flex flex-col items-start space-y-6">
            <h2 className="text-[#eeeeee] font-bold text-[28px] sm:text-[32px] leading-[40px] sm:leading-[50px]">
              Welcome to Excellence with{" "}
              <span className="text-[#00a2ed]">Shane Hall</span>
            </h2>

            <p className="text-white font-light text-[16px] sm:text-[18px] leading-[25px] max-w-[613px]">
              Shane Hall blends fitness, art, and entrepreneurship into a unique
              mentorship experience. Work out with top athletes and engage in live
              art sessions while learning from industry leaders. Achieve your
              goals in the solar industry or enhance your marketing skills with
              our comprehensive programs and vibrant community.
            </p>

            <div className="pt-2">
              <a
                href="#services"
                className="inline-flex items-center justify-center w-[166px] h-[50px] bg-[#00a2ed] hover:bg-[#1597d4] text-white font-semibold text-[18px] leading-[22px] rounded-sm transition-colors duration-200"
              >
                Learn More
              </a>
            </div>
          </div>

          {/* Right Feature Image */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div className="relative w-full max-w-[437px] h-[350px] sm:h-[405px] rounded-2xl overflow-hidden shadow-2xl border border-white/10">
              <Image
                src="/api/attachments/C-JI9QJ_3oG7TkbwN8slM"
                alt="Shane Hall Mentorship"
                fill
                className="object-cover object-center"
                sizes="(max-width: 768px) 100vw, 437px"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
