import { BrandMark } from '@/components/app/brand-mark'
import { ImageResponse } from 'next/og'

export const alt =
  'eodia insights — Vos données prennent du sens. Tableaux de bord, exploration et copilot IA.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// A public, illustrative dashboard: the preview never reads an account's data.
const bars = [42, 58, 50, 74, 67, 91, 83, 114, 102, 133, 125, 152]

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: '#101914',
        color: '#f4f8f3',
        padding: 64,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(ellipse at 88% 45%, #234f32 0%, #101914 68%)',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', width: 550, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <BrandMark size={56} />
          <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: -1 }}>eodia insights</div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 65,
            fontSize: 66,
            fontWeight: 700,
            letterSpacing: -3,
            lineHeight: 1.08,
          }}
        >
          <span>Vos données</span>
          <span>prennent</span>
          <span style={{ color: '#91eb80' }}>du sens.</span>
        </div>
        <div style={{ width: 440, marginTop: 26, fontSize: 23, lineHeight: 1.5, color: '#b5c7ba' }}>
          Explorez. Comprenez. Partagez.
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 'auto',
            fontSize: 17,
            color: '#c7d8cb',
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: 4, background: '#91eb80' }} />
          Open source
          <span style={{ color: '#53735c' }}> / </span>
          Copilot IA
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          left: 638,
          top: 105,
          width: 500,
          padding: 26,
          borderRadius: 22,
          border: '1px solid #426249',
          background: '#18271e',
          boxShadow: '0 24px 60px #09130c',
          transform: 'rotate(-4deg)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 21, fontWeight: 700 }}>Vue d’ensemble</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {[0, 1, 2].map((dot) => (
              <div
                key={dot}
                style={{ width: 6, height: 6, borderRadius: 3, background: '#617c68' }}
              />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            ['Chiffre d’affaires', '7,29 M€', '+12,4 %'],
            ['Commandes', '12 944', '+3,1 %'],
          ].map(([label, value, change]) => (
            <div
              key={label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                padding: 18,
                borderRadius: 12,
                background: '#213529',
                border: '1px solid #344e3c',
              }}
            >
              <div style={{ fontSize: 14, color: '#b5c7ba' }}>{label}</div>
              <div style={{ fontSize: 32, fontWeight: 700, marginTop: 7, letterSpacing: -1 }}>
                {value}
              </div>
              <div style={{ fontSize: 14, color: '#91eb80', marginTop: 5 }}>{change}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 16,
            padding: 18,
            borderRadius: 12,
            background: '#1d3024',
            border: '1px solid #344e3c',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
            <span>Une vision plus claire</span>
            <span style={{ color: '#93ab99' }}>12 mois</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 9,
              height: 165,
              borderBottom: '1px solid #425d49',
              paddingBottom: 1,
            }}
          >
            {bars.map((height, index) => (
              <div
                key={height}
                style={{
                  flex: 1,
                  height,
                  borderRadius: '5px 5px 0 0',
                  background: index === bars.length - 1 ? '#c7f7a0' : '#73ce60',
                  opacity: 0.5 + index * 0.045,
                }}
              />
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 10,
              fontSize: 12,
              color: '#93ab99',
            }}
          >
            <span>JAN</span>
            <span>JUIN</span>
            <span>DÉC</span>
          </div>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 5,
          background: 'linear-gradient(90deg, #2da31e, #91eb80, #234f32)',
        }}
      />
    </div>,
    size,
  )
}
