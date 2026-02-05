# Realm of Eternity - Unreal Engine 5 Asset Guidelines

## Overview
This document outlines the asset creation standards, folder structure, and naming conventions for Realm of Eternity's Unreal Engine 5 implementation. Following these guidelines ensures consistency, optimizes performance, and streamlines collaboration.

---

## Folder Structure

```
Content/
├── RealmOfEternity/
│   ├── Art/
│   │   ├── Characters/
│   │   │   ├── Player/
│   │   │   │   ├── Meshes/
│   │   │   │   ├── Textures/
│   │   │   │   ├── Materials/
│   │   │   │   └── Animations/
│   │   │   ├── NPCs/
│   │   │   │   ├── Friendly/
│   │   │   │   └── Enemies/
│   │   │   └── Bosses/
│   │   ├── Environment/
│   │   │   ├── Dawnhaven/
│   │   │   ├── Ironhold/
│   │   │   ├── DustfallExpanse/
│   │   │   ├── FrostpeakRange/
│   │   │   ├── ShadowfenMarsh/
│   │   │   ├── CrimsonCoast/
│   │   │   ├── VerdantHighlands/
│   │   │   ├── AbyssalDepths/
│   │   │   ├── Wilderness/
│   │   │   └── Shared/
│   │   │       ├── Foliage/
│   │   │       ├── Rocks/
│   │   │       ├── Water/
│   │   │       └── Props/
│   │   ├── Equipment/
│   │   │   ├── Weapons/
│   │   │   │   ├── Melee/
│   │   │   │   ├── Ranged/
│   │   │   │   └── Magic/
│   │   │   └── Armor/
│   │   │       ├── Copperweave/
│   │   │       ├── Ironbark/
│   │   │       ├── Stormforged/
│   │   │       ├── Moonveil/
│   │   │       ├── Voidstone/
│   │   │       ├── Eternium/
│   │   │       └── Wyrmscale/
│   │   ├── Items/
│   │   │   ├── Consumables/
│   │   │   ├── Materials/
│   │   │   └── Quest/
│   │   ├── UI/
│   │   │   ├── Icons/
│   │   │   ├── Widgets/
│   │   │   └── HUD/
│   │   └── VFX/
│   │       ├── Combat/
│   │       ├── Abilities/
│   │       ├── Environment/
│   │       └── UI/
│   ├── Audio/
│   │   ├── Music/
│   │   │   ├── Ambient/
│   │   │   ├── Combat/
│   │   │   └── Zones/
│   │   ├── SFX/
│   │   │   ├── Combat/
│   │   │   ├── UI/
│   │   │   ├── Environment/
│   │   │   └── Footsteps/
│   │   └── Voice/
│   │       ├── NPCs/
│   │       └── Player/
│   ├── Blueprints/
│   │   ├── Core/
│   │   │   ├── GameModes/
│   │   │   ├── GameInstance/
│   │   │   └── SaveSystem/
│   │   ├── Characters/
│   │   │   ├── Player/
│   │   │   └── AI/
│   │   ├── Combat/
│   │   │   ├── Abilities/
│   │   │   └── Damage/
│   │   ├── Skills/
│   │   ├── Inventory/
│   │   ├── Quests/
│   │   ├── UI/
│   │   └── Interactions/
│   ├── Data/
│   │   ├── DataTables/
│   │   ├── DataAssets/
│   │   └── CurveTables/
│   ├── Maps/
│   │   ├── MainMenu/
│   │   ├── World/
│   │   │   ├── Dawnhaven/
│   │   │   ├── Ironhold/
│   │   │   └── [OtherZones]/
│   │   ├── Dungeons/
│   │   └── Instances/
│   └── Cinematics/
│       ├── Cutscenes/
│       └── Sequences/
├── Developers/
│   └── [DeveloperName]/
└── ThirdParty/
    └── [PluginName]/
```

---

## Naming Conventions

### General Rules
- Use **PascalCase** for all assets
- Prefix assets with type identifier
- Be descriptive but concise
- No spaces or special characters (except underscores for variants)

### Asset Prefixes

| Asset Type | Prefix | Example |
|-----------|--------|---------|
| Blueprint | BP_ | BP_PlayerCharacter |
| Static Mesh | SM_ | SM_CopperweaveHelm |
| Skeletal Mesh | SK_ | SK_Goblin |
| Texture | T_ | T_CopperweaveHelm_D |
| Material | M_ | M_CopperweaveArmor |
| Material Instance | MI_ | MI_CopperweaveHelm |
| Animation | A_ | A_Goblin_Attack |
| Animation Blueprint | ABP_ | ABP_Player |
| Montage | AM_ | AM_SwordSlash |
| Blend Space | BS_ | BS_Locomotion |
| Particle System | PS_ | PS_FireBlast |
| Niagara System | NS_ | NS_MagicBolt |
| Sound Cue | SC_ | SC_SwordSwing |
| Sound Wave | SW_ | SW_MetalClang |
| Widget Blueprint | WBP_ | WBP_InventorySlot |
| Data Table | DT_ | DT_ItemDefinitions |
| Data Asset | DA_ | DA_QuestData |
| Curve | C_ | C_DamageOverTime |
| Level | L_ | L_Dawnhaven_Town |
| Level Sequence | LS_ | LS_IntroCutscene |
| Physics Asset | PHYS_ | PHYS_PlayerRagdoll |
| Rig | RIG_ | RIG_PlayerCharacter |
| Control Rig | CR_ | CR_ProceduralAnim |

### Texture Suffixes

| Texture Type | Suffix | Example |
|-------------|--------|---------|
| Diffuse/Albedo | _D | T_CopperweaveHelm_D |
| Normal | _N | T_CopperweaveHelm_N |
| Roughness | _R | T_CopperweaveHelm_R |
| Metallic | _M | T_CopperweaveHelm_M |
| Ambient Occlusion | _AO | T_CopperweaveHelm_AO |
| Emissive | _E | T_MagicOrb_E |
| Opacity/Alpha | _A | T_TreeLeaves_A |
| Height/Displacement | _H | T_Terrain_H |
| Packed (ORM) | _ORM | T_CopperweaveHelm_ORM |
| Mask | _Mask | T_CopperweaveHelm_Mask |
| Subsurface | _SSS | T_Skin_SSS |

### Animation Naming

```
A_[Character]_[Action]_[Variant]

Examples:
A_Player_Idle_Combat
A_Player_Run_Forward
A_Player_Attack_Sword_01
A_Goblin_Death_Front
A_Boss_Scorath_FireBreath
```

---

## Technical Specifications

### Characters

#### Player Character
- **Skeletal Mesh**: ~80,000 triangles (with LODs)
- **LOD Levels**: 4 (100%, 50%, 25%, 10%)
- **Bones**: ~65 bones max
- **Texture Resolution**: 4K body, 2K head
- **Material Slots**: 3-4 max (body, head, eyes, gear overlay)

#### NPCs - Friendly
- **Skeletal Mesh**: ~30,000-50,000 triangles
- **LOD Levels**: 3
- **Bones**: ~45 bones
- **Texture Resolution**: 2K

#### NPCs - Enemies (Standard)
- **Skeletal Mesh**: ~20,000-40,000 triangles
- **LOD Levels**: 4
- **Bones**: ~35-50 bones
- **Texture Resolution**: 2K

#### Bosses
- **Skeletal Mesh**: ~100,000-200,000 triangles
- **LOD Levels**: 4
- **Bones**: ~80-120 bones
- **Texture Resolution**: 4K

### Environment

#### Modular Architecture
- Grid Size: 100cm (1 meter) base unit
- Snap increments: 25cm, 50cm, 100cm
- Wall heights: 300cm (standard), 400cm (tall)
- Door openings: 200cm x 300cm

#### Terrain
- Landscape resolution: 1009x1009 per component
- Component size: 127x127 quads
- Texture weight layers: 16 max per component
- Virtual texturing: Enabled for terrain

#### Foliage
- Tree LODs: 4 levels
- Grass: Nanite-enabled or imposters at distance
- Culling distance: 20,000 units for grass
- Density maps for procedural placement

### Props and Items

#### Equipment (Weapons/Armor)
- **Triangles**: 5,000-15,000 per piece
- **LOD Levels**: 3
- **Texture Resolution**: 1K-2K
- **Sockets**: Standard naming for attachment

#### Small Props
- **Triangles**: 500-3,000
- **LOD Levels**: 2-3
- **Texture Resolution**: 512-1K

### UI Assets

#### Icons
- Item icons: 256x256 or 512x512
- Ability icons: 128x128
- Status icons: 64x64
- Format: PNG with alpha, compressed to TGA in-engine

#### Atlases
- Group related icons into atlases
- Maximum atlas size: 4096x4096
- Leave 2px padding between icons

---

## Material Guidelines

### Master Materials
Create master materials for each category:
- `M_Master_Character`
- `M_Master_Equipment`
- `M_Master_Environment`
- `M_Master_Foliage`
- `M_Master_VFX`
- `M_Master_Water`

### Material Instances
- Always create material instances from masters
- Use material parameter collections for global parameters
- Group parameters by category (Color, Roughness, Effects)

### Performance Targets
- Instruction count: <200 for characters, <150 for environment
- Texture samples: <16 per material
- Use material LODs for complex shaders

### Layered Materials
For equipment tier visual progression:
```
Base Layer: Metal substrate
Layer 1: Wear/dirt
Layer 2: Magical effects (glow, runes)
Layer 3: Dynamic effects (damage, buffs)
```

---

## Animation Guidelines

### Skeleton Standards

#### Player Skeleton
```
Root
├── Pelvis
│   ├── Spine_01
│   │   ├── Spine_02
│   │   │   ├── Spine_03
│   │   │   │   ├── Neck
│   │   │   │   │   └── Head
│   │   │   │   ├── Clavicle_L
│   │   │   │   │   └── Shoulder_L → Arm chain
│   │   │   │   └── Clavicle_R
│   │   │   │       └── Shoulder_R → Arm chain
│   ├── Thigh_L → Leg chain
│   └── Thigh_R → Leg chain
└── IK bones (optional)
```

### Animation Blueprint Structure
1. **Locomotion State Machine**
   - Idle states
   - Movement blend space
   - Jump/Fall states

2. **Combat Layer**
   - Upper body slot for attacks
   - Additive hit reactions
   - Ability animations

3. **Overlay Layer**
   - Equipment holding poses
   - Skill animations (mining, fishing, etc.)

### Key Animations Required

#### Player
- Idle (relaxed, combat stance per weapon type)
- Walk/Run (8-directional blend space)
- Sprint
- Jump/Land
- Dodge/Roll
- Attack combos (per weapon type)
- Block/Parry
- Death
- Skill actions (mining, woodcutting, fishing, cooking, etc.)
- Emotes

#### Enemies
- Idle
- Walk/Run
- Attack (1-3 variations)
- Special abilities
- Hit reactions
- Death (1-3 variations)
- Spawn/Despawn

---

## VFX Guidelines

### Niagara vs Cascade
- Use **Niagara** for all new effects
- Cascade only for legacy support

### Effect Categories

#### Combat Effects
- Weapon trails (per damage type)
- Hit impacts (physical, magical, elemental)
- Ability effects (linked to ability data)
- Status effects (buffs, debuffs, DoTs)

#### Environmental Effects
- Weather (rain, snow, sandstorm)
- Ambient particles (dust motes, fireflies)
- Water interactions
- Fire/smoke

### Performance Budgets
- Combat effects: 1000-5000 particles per effect
- Ambient effects: 100-500 particles
- LOD particles at distance
- GPU simulation preferred

---

## Audio Guidelines

### Sound Categories
1. **Music** - Background scores, combat music
2. **Ambience** - Environmental loops per zone
3. **SFX** - One-shots and loops for actions
4. **Voice** - NPC dialogue, player grunts
5. **UI** - Interface feedback sounds

### Technical Specs
- Format: WAV (source), Opus (in-game)
- Sample Rate: 48kHz
- Bit Depth: 16-bit minimum, 24-bit for music
- Mono for 3D sounds, Stereo for music/UI

### Sound Cue Structure
- Use Sound Classes for volume control
- Implement attenuation presets
- Concurrency limits per category

---

## Optimization Guidelines

### Nanite Usage
**Use Nanite for:**
- Large environment meshes
- Architectural elements
- Static world props
- Terrain rock formations

**Do NOT use Nanite for:**
- Skeletal meshes
- Foliage with alpha
- Transparent materials
- Small props (<1000 tris)

### Lumen Settings
- Use Lumen for indirect lighting
- Hardware ray tracing for high-end
- Software ray tracing as fallback
- Light importance volumes for interiors

### Level Streaming
- World Partition enabled
- Grid cell size: 12800 units (128m)
- Data layers for gameplay vs visual
- Always Loaded sublevel for core gameplay

### HLOD Strategy
- Generate HLODs for distant geometry
- Proxy mesh simplification: 10%
- HLOD transition distance: 50,000 units

---

## Import Checklist

### Before Import
- [ ] Correct naming convention applied
- [ ] Scale verified (1 unit = 1 cm)
- [ ] Pivot point at origin/base
- [ ] Clean mesh (no floating vertices, n-gons fixed)
- [ ] UV channels: 0 for textures, 1 for lightmaps

### Static Mesh Import
- [ ] Auto Generate Collision or custom UCX
- [ ] Generate Lightmap UVs
- [ ] LOD settings configured
- [ ] Nanite enabled (if applicable)

### Skeletal Mesh Import
- [ ] Skeleton assignment
- [ ] Physics asset generated
- [ ] Morph targets (if applicable)
- [ ] Cloth simulation data

### Textures
- [ ] Compression settings appropriate
- [ ] sRGB correct (off for data textures)
- [ ] Mip settings configured
- [ ] Virtual texture enabled (large textures)

---

## Version Control

### Branching Strategy
```
main (stable builds)
├── develop (integration branch)
│   ├── feature/[feature-name]
│   ├── art/[asset-category]
│   └── bugfix/[issue-id]
└── release/[version]
```

### Binary Asset Rules
- One lock per file (no merging binary assets)
- Check in complete assets only
- Test before commit
- Include metadata files

### Commit Messages
```
[Category] Brief description

Categories: Art, Audio, Blueprint, Map, VFX, UI, Data
Example: [Art] Add Copperweave armor set meshes and textures
```

---

## Data Integration

### JSON to UE5 Data Tables
The game data in `/Data/` should be imported as Data Tables:

| JSON File | Data Table | Row Structure |
|-----------|------------|---------------|
| items.json | DT_Items | FItemDefinition |
| enemies.json | DT_Enemies | FEnemyDefinition |
| abilities.json | DT_Abilities | FAbilityDefinition |
| quests.json | DT_Quests | FQuestDefinition |
| loot_tables.json | DT_LootTables | FLootTableDefinition |

### Automated Import Pipeline
Use the Python tools in `/Tools/` to:
1. Validate JSON data
2. Generate DataTable CSVs
3. Import to UE5 project
4. Verify asset references

---

## Quality Standards

### Visual Quality Targets
- Reference: Modern MMOs (Dragon Wilds, Black Desert Online)
- Stylized realism aesthetic
- Consistent art direction per zone
- VFX should enhance, not obscure gameplay

### Performance Targets
- **PC High**: 60 FPS @ 1440p
- **PC Medium**: 60 FPS @ 1080p
- **PC Low**: 30 FPS @ 720p
- **Console**: 30 FPS @ dynamic resolution

### Asset Review Checklist
- [ ] Follows naming conventions
- [ ] Correct folder location
- [ ] LODs generated
- [ ] Collision appropriate
- [ ] Materials optimized
- [ ] Tested in-game
- [ ] No console errors/warnings

---

## Contact

For questions about these guidelines:
- Art Lead: TBD
- Technical Art: TBD
- Level Design: TBD
