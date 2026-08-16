import type { LayoutBox } from "./figma-layout";
import type { ProjectFile } from "./types";

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  price: string;
  image: string;
  images: string[];
};

export type CatalogPost = {
  slug: string;
  title: string;
  image: string;
  excerpt: string;
};

export function slugify(value: string): string {
  const s = value
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return s || "item";
}

function collectText(box: LayoutBox, limit = 120): string {
  const parts: string[] = [];
  const walk = (node: LayoutBox) => {
    if (node.text) parts.push(node.text);
    if (parts.join(" ").length >= limit) return;
    for (const child of node.children) walk(child);
  };
  walk(box);
  return parts.join(" ").slice(0, limit);
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export function extractCatalog(root: LayoutBox): CatalogProduct[] {
  const products: CatalogProduct[] = [];

  const consider = (parent: LayoutBox) => {
    const imgs = parent.children.filter(
      (child) =>
        child.assetUrl &&
        !child.icon &&
        child.w >= 90 &&
        child.h >= 90 &&
        child.w <= 520,
    );
    const texts = parent.children.filter((child) => child.text);
    for (const img of imgs) {
      const nearby = texts.filter((text) => {
        const under =
          text.y >= img.y + img.h - 24 && text.y <= img.y + img.h + 96;
        const aligned = Math.abs(text.x - img.x) < Math.max(img.w * 0.7, 48);
        return under && aligned;
      });
      const priceNode = nearby.find((text) => /[¥$€£]|^\d/.test(text.text || ""));
      const nameNode = nearby.find(
        (text) => text !== priceNode && (text.text || "").length < 40,
      );
      if (!nameNode && !priceNode) continue;
      const name = (nameNode?.text || img.name || "Product").trim();
      const image = img.assetUrl as string;
      const extras = parent.children
        .filter(
          (child) =>
            child !== img &&
            child.assetUrl &&
            !child.icon &&
            Math.abs(child.w - img.w) < 48 &&
            Math.abs(child.h - img.h) < 48 &&
            Math.abs(child.x - img.x) < 24,
        )
        .map((child) => child.assetUrl as string);
      products.push({
        id: img.id,
        slug: slugify(name),
        name,
        price: (priceNode?.text || "").trim(),
        image,
        images: [image, ...extras].filter(
          (src, index, all) => all.indexOf(src) === index,
        ),
      });
      if (img.role === "card" || !img.href) {
        img.role = "card";
        img.href = `/product/${slugify(name)}`;
      }
    }
    for (const child of parent.children) consider(child);
  };

  consider(root);
  const used = new Set<string>();
  const list = uniqueBy(products, (p) => p.image)
    .slice(0, 24)
    .map((product) => {
      let slug = product.slug;
      let n = 2;
      while (used.has(slug)) slug = `${product.slug}-${n++}`;
      used.add(slug);
      return { ...product, slug };
    });
  const byId = new Map(list.map((product) => [product.id, product]));
  const wire = (box: LayoutBox) => {
    const product = byId.get(box.id);
    if (product) {
      box.role = "card";
      box.href = `/product/${product.slug}`;
    }
    box.children.forEach(wire);
  };
  wire(root);
  return list;
}

export function extractJournal(
  root: LayoutBox,
  products: CatalogProduct[] = [],
): CatalogPost[] {
  const productImages = new Set(products.map((p) => p.image));
  const posts: CatalogPost[] = [];
  const consider = (parent: LayoutBox) => {
    const imgs = parent.children.filter(
      (child) =>
        child.assetUrl &&
        !child.icon &&
        child.h >= 160 &&
        child.h / Math.max(child.w, 1) >= 1.05 &&
        child.w <= 420,
    );
    const texts = parent.children.filter((child) => child.text);
    for (const img of imgs) {
      const nearby = texts.filter(
        (text) =>
          text.y >= img.y + img.h - 12 &&
          text.y <= img.y + img.h + 120 &&
          Math.abs(text.x - img.x) < img.w,
      );
      if (productImages.has(img.assetUrl as string)) continue;
      const title = nearby.find((text) => (text.text || "").length > 4);
      if (!title?.text || /[¥$€]/.test(title.text)) continue;
      posts.push({
        slug: slugify(title.text),
        title: title.text.trim(),
        image: img.assetUrl as string,
        excerpt: nearby.find((t) => t !== title)?.text || "",
      });
    }
    for (const child of parent.children) consider(child);
  };
  consider(root);
  return uniqueBy(posts, (p) => p.image).slice(0, 12);
}

export function buildCatalogFile(
  products: CatalogProduct[],
  posts: CatalogPost[] = [],
): ProjectFile {
  return {
    path: "lib/catalog.ts",
    language: "ts",
    code: `export type Product = {
  slug: string;
  name: string;
  price: string;
  image: string;
  images: string[];
};

export type Post = {
  slug: string;
  title: string;
  image: string;
  excerpt: string;
};

export const products: Product[] = ${JSON.stringify(
      products.map(({ slug, name, price, image, images }) => ({
        slug,
        name,
        price,
        image,
        images,
      })),
      null,
      2,
    )};

export const posts: Post[] = ${JSON.stringify(posts, null, 2)};

export function getProduct(slug: string) {
  if (!products.length) return undefined;
  return products.find((item) => item.slug === slug) || products[0];
}

export function getPost(slug: string) {
  return posts.find((item) => item.slug === slug) || posts[0];
}

export function searchProducts(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return products;
  return products.filter((item) =>
    (item.name + " " + item.price).toLowerCase().includes(q),
  );
}
`,
  };
}

export function buildProductChromeFiles(): ProjectFile[] {
  return [
    {
      path: "components/product-gallery.tsx",
      language: "tsx",
      code: `"use client";

import { useMemo, useState } from "react";

export function ProductGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const shots = useMemo(() => images.filter(Boolean), [images]);
  const [active, setActive] = useState(0);
  if (!shots.length) return null;
  const current = shots[Math.min(active, shots.length - 1)];
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="overflow-hidden bg-black/5">
        <img src={current} alt={alt} className="aspect-square w-full object-contain" />
      </div>
      {shots.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {shots.map((src, index) => (
            <button
              key={src + index}
              type="button"
              onClick={() => setActive(index)}
              className={
                index === active
                  ? "h-16 w-16 overflow-hidden ring-2 ring-current"
                  : "h-16 w-16 overflow-hidden opacity-70 hover:opacity-100"
              }
            >
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
`,
    },
    {
      path: "components/site-tabs.tsx",
      language: "tsx",
      code: `"use client";

import { useState, type ReactNode } from "react";

export function SiteTabs({
  tabs,
}: {
  tabs: Array<{ id: string; label: string; content: ReactNode }>;
}) {
  const [active, setActive] = useState(tabs[0]?.id || "");
  const current = tabs.find((tab) => tab.id === active) || tabs[0];
  if (!tabs.length) return null;
  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-current/20">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={
              tab.id === active
                ? "border-b-2 border-current px-3 py-2 text-sm"
                : "px-3 py-2 text-sm opacity-60 hover:opacity-100"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="pt-6">{current?.content}</div>
    </div>
  );
}
`,
    },
  ];
}

export function buildDynamicProductPage(bg: string, fg: string): ProjectFile {
  return {
    path: "app/product/[slug]/page.tsx",
    language: "tsx",
    code: `"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ProductGallery } from "@/components/product-gallery";
import { SiteTabs } from "@/components/site-tabs";
import { getProduct, products } from "@/lib/catalog";

export default function ProductPage() {
  const params = useParams<{ slug: string }>();
  const product = getProduct(String(params.slug || ""));
  const [qty, setQty] = useState(1);
  const related = useMemo(
    () => (product ? products.filter((item) => item.slug !== product.slug).slice(0, 4) : []),
    [product],
  );
  if (!product) {
    return (
      <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
        <p>No product yet.</p>
        <Link href="/">Home</Link>
      </main>
    );
  }
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-12 sm:px-6" style={{ background: ${JSON.stringify(bg)}, color: ${JSON.stringify(fg)} }}>
      <p className="mb-6 text-sm"><Link href="/">Home</Link> / {product.name}</p>
      <div className="grid gap-10 md:grid-cols-2">
        <ProductGallery images={product.images} alt={product.name} />
        <div>
          <h1 className="text-3xl">{product.name}</h1>
          {product.price ? <p className="mt-3 text-xl">{product.price}</p> : null}
          <div className="mt-6 flex items-center gap-3">
            <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))} className="h-10 w-10 border">-</button>
            <span>{qty}</span>
            <button type="button" onClick={() => setQty((n) => n + 1)} className="h-10 w-10 border">+</button>
          </div>
          <button
            type="button"
            className="mt-6 px-6 py-3 text-white"
            style={{ background: ${JSON.stringify(fg)} }}
            onClick={() => {
              const key = "luca-cart";
              const cart = JSON.parse(window.localStorage.getItem(key) || "[]");
              cart.push({ slug: product.slug, qty });
              window.localStorage.setItem(key, JSON.stringify(cart));
            }}
          >
            Add to cart
          </button>
          <div className="mt-10">
            <SiteTabs
              tabs={[
                { id: "details", label: "Details", content: <p>{product.name}</p> },
                { id: "care", label: "Care", content: <p>Handle with care.</p> },
                { id: "shipping", label: "Shipping", content: <p>Ships after purchase confirmation.</p> },
              ]}
            />
          </div>
        </div>
      </div>
      {related.length ? (
        <section className="mt-16">
          <h2 className="mb-6 text-2xl">More</h2>
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            {related.map((item) => (
              <Link key={item.slug} href={"/product/" + item.slug} className="block">
                <img src={item.image} alt={item.name} className="mb-2 aspect-square w-full bg-black/5 object-contain" />
                <p className="text-sm">{item.name}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
`,
  };
}

export function buildThinHomeRedirect(): ProjectFile {
  return {
    path: "app/page.tsx",
    language: "tsx",
    code: `import { redirect } from "next/navigation";
import { products } from "@/lib/catalog";

export default function Home() {
  if (products[0]) redirect("/product/" + products[0].slug);
  return <main />;
}
`,
  };
}
