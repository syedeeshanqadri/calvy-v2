import Link from "next/link";
import { SafeFrame, SafeImage } from "@/components/site/SafeImage";
import { usableImageUrl } from "@/lib/images";
import { Video } from "lucide-react";
import { formatCurrencyAmount } from "@/lib/currency";
import { offersOnline, onlineBadge, type ServiceModeValue } from "@/lib/online";
import { initialsOf } from "@/components/site/Brand";
import type { FaqItem, GalleryItem } from "@/lib/siteSections";

/** Presentational pieces for the owner-editable sections. Used by the public site and the editor's live preview. */

export function OfferBanner({ text }: { text: string }) {
  return (
    <div className="st-offer" role="region" aria-label="Current offer">
      <div className="st-wrap"><p>{text}</p></div>
    </div>
  );
}

export function GallerySection({ title, images }: { title: string; images: GalleryItem[] }) {
  if (images.length === 0) return null;
  return (
    <section id="gallery" className="st-section">
      <div className="st-wrap">
        <div className="st-head-sec"><h2>{title}</h2></div>
        <ul className="st-gallery">
          {images.map((img) => <SafeFrame key={img.url} as="li" className="st-gallery-item" src={img.url} alt={img.alt} sizes="(max-width: 900px) 50vw, 25vw" />)}
        </ul>
      </div>
    </section>
  );
}

export function FaqSection({ title, items }: { title: string; items: FaqItem[] }) {
  if (items.length === 0) return null;
  return (
    <section id="faq" className="st-section tint">
      <div className="st-wrap st-faq-layout">
        <div className="st-head-sec"><h2>{title}</h2></div>
        <div className="st-faq">
          {items.map((f) => (
            <details key={f.q} className="st-faq-item">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export interface TeamCardMember { id: string; name: string; role: string; photoUrl?: string | null; bio?: string | null; specialisation?: string | null }

export function TeamCards({ staff }: { staff: TeamCardMember[] }) {
  return (
    <ul className="st-team">
      {staff.map((m) => (
        <li key={m.id} className="st-person">
          {usableImageUrl(m.photoUrl) ? (
            <div className="st-person-photo"><SafeImage src={usableImageUrl(m.photoUrl)!} alt={m.name} fill sizes="(max-width: 900px) 74vw, 25vw" unoptimized fallback={<div className="st-avatar" aria-hidden>{initialsOf(m.name)}</div>} /></div>
          ) : (
            <div className="st-avatar" aria-hidden>{initialsOf(m.name)}</div>
          )}
          <b>{m.name}</b>
          <span className="st-muted">{m.role}</span>
          {m.specialisation && <span className="st-tag st-person-spec">{m.specialisation}</span>}
          {m.bio && <p className="st-person-bio">{m.bio}</p>}
        </li>
      ))}
    </ul>
  );
}

export interface ServiceCardItem { id: string; name: string; description: string; duration: number; price: number; capacity: number; imageUrl?: string | null; mode?: ServiceModeValue | null; meetingUrl?: string | null }

export function ServiceCards({ services, bookingUrl, currency }: { services: ServiceCardItem[]; bookingUrl: string; currency: string }) {
  return (
    <ul className="st-svc-cards">
      {services.map((svc) => (
        <li key={svc.id} className="st-svc-card">
          {usableImageUrl(svc.imageUrl) && <SafeFrame className="st-svc-card-img" src={usableImageUrl(svc.imageUrl)!} alt="" sizes="(max-width: 900px) 100vw, 33vw" />}
          <div className="st-svc-card-body">
            <div className="st-svc-name">
              {svc.name}
              {svc.capacity > 1 && <span className="st-tag">Up to {svc.capacity} people</span>}
              {offersOnline(svc) && <span className="st-online"><Video className="st-ico" aria-hidden />{onlineBadge(svc)}</span>}
            </div>
            {svc.description && <p className="st-svc-desc">{svc.description}</p>}
            <div className="st-svc-card-foot">
              <span className="st-svc-meta">{svc.duration} min</span>
              <span className="st-svc-price">{svc.price === 0 ? "Free" : formatCurrencyAmount(svc.price, currency)}</span>
            </div>
            <Link href={`${bookingUrl}?service=${svc.id}`} className="st-btn st-btn-ghost st-btn-sm" aria-label={`Book ${svc.name}`}>Book</Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
