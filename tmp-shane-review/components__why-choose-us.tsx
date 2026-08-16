"use client";

export function WhyChooseUs() {
  const stats = [
    {
      value: "12",
      label: "Years of\nexperience",
    },
    {
      value: "820",
      label: "SATISFIED\nCLIENTS",
    },
    {
      value: "720",
      label: "EMPLOYEES\nWORLDWIDE",
    },
    {
      value: "70+",
      label: "COUNTRIES\nTRAVEL",
    },
  ];

  return (
    <section className="w-full bg-black py-16 border-t border-b border-gray-900">
      <div className="max-w-[1200px] mx-auto px-6">
        <h2 className="text-center text-white font-bold text-[30px] sm:text-[35px] leading-[50px] tracking-wide mb-12 uppercase">
          WHY CHOOSE US
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-0 items-center justify-between">
          {stats.map((stat, idx) => (
            <div key={idx} className="relative flex items-center justify-center lg:px-4">
              <div className="flex items-center gap-4">
                <span className="font-extrabold text-[48px] sm:text-[55px] leading-[67px] text-[#eeeeee] tracking-tight">
                  {stat.value}
                </span>
                <span className="text-[14px] leading-[19px] font-bold text-white uppercase whitespace-pre-line">
                  {stat.label}
                </span>
              </div>

              {/* Cyan divider for desktop screens (Line 3, 7, 8) */}
              {idx < stats.length - 1 && (
                <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-[2px] h-[75px] bg-[#1597d4]" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
