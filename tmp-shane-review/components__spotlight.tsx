"use client";

import Image from "next/image";

export function Spotlight() {
  return (
    <section className="w-full bg-black py-16 border-t border-b border-gray-900">
      <div className="max-w-[1152px] mx-auto px-6">
        <h2 className="text-center text-white font-bold text-[32px] sm:text-[40px] leading-[50px] mb-12">
          In The Spotlight
        </h2>

        <div className="flex flex-col md:flex-row items-center justify-between gap-8 md:gap-12">
          {/* Miami New Times */}
          <div className="flex items-center justify-center opacity-90 hover:opacity-100 transition-opacity">
            <Image
              src="/api/attachments/2E0iwj9J--ONFY45prufU"
              alt="Miami New Times"
              width={237}
              height={65}
              className="object-contain max-h-[65px] w-auto filter brightness-110"
            />
          </div>

          {/* Flaunt */}
          <div className="flex items-center justify-center opacity-90 hover:opacity-100 transition-opacity">
            <Image
              src="/api/attachments/bbn7MJ1Xf5m2BkQxrCC52"
              alt="Flaunt"
              width={327}
              height={87}
              className="object-contain max-h-[75px] w-auto filter brightness-110"
            />
          </div>

          {/* Daily Caller */}
          <div className="flex items-center justify-center opacity-90 hover:opacity-100 transition-opacity">
            <Image
              src="/api/attachments/DaM-J7jJmu_yMnnKcgSmO"
              alt="Daily Caller"
              width={280}
              height={75}
              className="object-contain max-h-[75px] w-auto filter brightness-110"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
