# Unreal Engine 5 Project

## Setup Instructions

1. Install Unreal Engine 5.4+ via Epic Games Launcher
2. Create new project: **Third Person** template
3. Name it `RealmOfEternity`
4. Move the generated project files into this `Game/` directory

## Recommended Settings

### Project Settings
- Enable **World Partition** (Edit → Project Settings → World Partition)
- Enable **Nanite** for meshes
- Enable **Lumen** for global illumination
- Set up **Gameplay Ability System** plugin

### Required Plugins
- Gameplay Ability System
- Enhanced Input
- Common UI
- Online Subsystem

## Folder Structure

After creating the project, organize Content folder as:

```
Content/
├── Characters/
│   ├── Player/
│   │   ├── Meshes/
│   │   ├── Animations/
│   │   └── Blueprints/
│   └── NPCs/
├── Environments/
│   ├── Landscapes/
│   ├── Props/
│   └── Foliage/
├── VFX/
├── Audio/
├── UI/
├── Materials/
├── Blueprints/
│   ├── Core/
│   ├── Abilities/
│   ├── Items/
│   └── Systems/
└── Data/
    ├── DataTables/
    └── DataAssets/
```

## Git LFS

For large binary files, configure Git LFS:

```bash
git lfs install
git lfs track "*.uasset"
git lfs track "*.umap"
git lfs track "*.png"
git lfs track "*.wav"
git lfs track "*.mp3"
git lfs track "*.fbx"
```

## Building

### Development
```
UnrealEditor.exe RealmOfEternity.uproject -game
```

### Shipping Build
Use Unreal Editor: Platforms → Windows → Package Project
