import { defineCollection, reference } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import {
  alt,
  Consent,
  fact,
  Finish,
  Hours,
  question,
  review,
  Seo,
  ServiceKey,
  TestimonialSource,
  WoodOrigin,
} from './lib/content-schema';

const services = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/services' }),
  schema: ({ image }) =>
    z.object({
      key: ServiceKey,
      title: z.string(),
      order: z.number().int(),
      teaser: z.string().max(180),
      seo: Seo,
      hero: z.object({ src: image(), alt, sketch: z.string().optional() }),
      types: z
        .array(
          z.object({
            name: z.string(),
            text: z.string(),
            highlight: z.boolean().optional(),
            image: image().optional(),
            alt: alt.optional(),
          }),
        )
        .default([]),
      woods: z.array(reference('woods')).default([]),
      faqs: z.array(reference('faqs')).default([]),
      projects: z.array(reference('projects')).default([]),
      schemaServiceType: z.string(),
      review,
    }),
});

const projects = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/projects' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      summary: z.string().max(200),
      categories: z.array(ServiceKey).min(1),
      woods: z.array(reference('woods')).default([]),
      location: z.string().optional(),
      year: z.number().int().optional(),
      cover: z.object({ src: image(), alt, caption: z.string().optional() }),
      gallery: z.array(z.object({ src: image(), alt, caption: z.string().optional() })).default([]),
      beforeAfter: z
        .object({
          before: z.object({ src: image(), alt }),
          after: z.object({ src: image(), alt }),
        })
        .optional(),
      detailPage: z.boolean().default(false),
      featured: z.boolean().default(false),
      review,
    }),
});

const testimonials = defineCollection({
  loader: file('src/content/testimonials.yaml'),
  schema: z.object({
    author: z.string(),
    quote: z.string(),
    source: TestimonialSource,
    date: z.string().optional(),
    project: reference('projects').optional(),
    /** Permission to quote (plan §3.2); only `erteilt` may be published in production. */
    permission: Consent.default('ausstehend'),
    review,
  }),
});

const team = defineCollection({
  loader: file('src/content/team.yaml'),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      role: z.string(),
      since: z.number().int().optional(),
      bio: z.string().optional(),
      portrait: image().optional(),
      portraitAlt: alt.optional(),
      publicationConsent: Consent,
      review,
    }),
});

const jobs = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/jobs' }),
  schema: z.object({
    title: z.string(),
    identifier: z.string(),
    active: z.boolean(),
    datePosted: z.coerce.date(),
    validThrough: z.coerce.date().optional(),
    employmentType: z.array(z.string()).min(1),
    workHours: z.string().optional(),
    baseSalary: fact(
      z.object({ min: z.number(), max: z.number(), unit: z.enum(['HOUR', 'MONTH', 'YEAR']) }),
    ).optional(),
    responsibilities: z.array(z.string()).default([]),
    qualifications: z.array(z.string()).default([]),
    benefits: z.array(z.string()).default([]),
    educationRequirements: z.string().optional(),
    occupationalCategory: z.string().optional(),
    directApply: z.boolean().default(false),
    seo: Seo,
    review,
  }),
});

const woods = defineCollection({
  loader: file('src/content/woods.yaml'),
  schema: z.object({
    name: z.string(),
    latin: z.string().optional(),
    origin: WoodOrigin,
    certification: z.array(z.enum(['FSC', 'PEFC'])).default([]),
    durabilityClass: z.string().optional(),
    uses: z.array(ServiceKey).default([]),
    description: z.string(),
    swatch: z.string().optional(),
    configurator: z
      .object({
        enabled: z.boolean(),
        textureId: z.string(),
        avgColor: z.string(),
        eModulusGPa: z.number(),
        finishes: z.array(Finish).min(1),
      })
      .optional(),
    review,
  }),
});

const faqs = defineCollection({
  loader: file('src/content/faqs.yaml'),
  schema: z.object({
    question,
    answer: z.string(),
    topics: z.array(z.string()).default([]),
    order: z.number().int(),
    review,
  }),
});

const settings = defineCollection({
  loader: file('src/content/settings.yaml'),
  schema: z.object({
    name: z.string(),
    legalName: fact(z.string()),
    owner: z.object({ name: z.string(), title: z.string(), masterSince: z.number().int() }),
    address: z.object({
      street: z.string(),
      postalCode: z.string(),
      city: z.string(),
      region: z.string(),
      country: z.literal('DE'),
    }),
    geo: fact(z.object({ lat: z.number(), lng: z.number() })).optional(),
    phone: z.object({ display: z.string(), e164: z.string() }),
    email: z.email(),
    hours: fact(z.array(Hours)),
    areaServed: fact(z.array(z.string())),
    employees: fact(z.string()),
    stats: z.object({ projects: fact(z.number().int()) }),
    rating: z.object({
      value: z.number().min(0).max(5),
      count: z.number().int(),
      snapshotDate: z.string(),
      profileUrl: fact(z.url()).optional(),
    }),
    legal: z.object({
      // Facts, so the production guard can refuse unconfirmed legal data.
      vatId: fact(z.string()).optional(),
      economicId: fact(z.string()).optional(),
      craftsRegisterNo: fact(z.string()),
      professionalTitle: z.string(),
      chamber: z.object({ name: z.string(), address: z.string(), url: z.url() }),
      liabilityInsurance: fact(z.string()).optional(),
    }),
    review,
  }),
});

export const collections = { services, projects, testimonials, team, jobs, woods, faqs, settings };
